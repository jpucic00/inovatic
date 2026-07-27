import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { monthWindows } from '@/lib/teacher-work-report'
import { zagrebDateKey } from '@/lib/attendance-window'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

// Import after the mocks so the actions pick up the mocked notFound.
const { getTeacherWorkReport } = await import('@/actions/admin/teacher-work')
const { bulkMarkSession } = await import('@/actions/teacher/attendance')
const { unassignTeacherFromGroup } = await import('@/actions/admin/teacher')

const SY = '2026/2027'
const WINDOWS = monthWindows(new Date())
const DAY_MS = 86_400_000

/** Nth day (1-based) of a report window, as a UTC-midnight date. */
function dayOf(window: { year: number; month: number }, day: number): Date {
  return new Date(Date.UTC(window.year, window.month - 1, day))
}

function dateKeyOf(window: { year: number; month: number }, day: number): string {
  return dayOf(window, day).toISOString().slice(0, 10)
}

/** A date safely outside both report windows. */
const LONG_AGO = new Date(dayOf(WINDOWS.previous, 1).getTime() - 40 * DAY_MS)

/**
 * A date a TEACHER is still allowed to mark: this month, never in the future.
 * Fixed days-of-month would fail whenever the suite runs early in a month.
 * Distinctness degrades near the 1st, which is harmless — the uniqueness key is
 * (teacher, group, date) and each test builds its own group.
 */
function markableDateKey(daysAgo = 0): string {
  const today = zagrebDateKey(new Date())
  const day = Math.max(1, Number(today.slice(8, 10)) - daysAgo)
  return `${today.slice(0, 8)}${String(day).padStart(2, '0')}`
}

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

async function adminSession(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
}

/** Group with one enrolled student, 18:30–20:00 (90 min) unless overridden. */
async function groupWithStudent(
  overrides: { city?: 'SPLIT' | 'SIBENIK'; startTime?: string; endTime?: string } = {},
) {
  const city = overrides.city ?? 'SPLIT'
  const group = await createGroup({
    city,
    schoolYear: SY,
    startTime: overrides.startTime ?? '18:30',
    endTime: overrides.endTime ?? '20:00',
  })
  const student = await createStudent({ city })
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
  return { group, enrollment }
}

/** Write a teaching-hours row the way the seed/import path would. */
function markTeacherPresent(
  userId: string,
  scheduledGroupId: string,
  sessionDate: Date,
  present = true,
) {
  return db.teacherAttendance.create({
    data: { userId, scheduledGroupId, sessionDate, present, recordedById: userId },
  })
}

describe('getTeacherWorkReport — hours come from TeacherAttendance', () => {
  it('splits sessions into this month and last month, ignoring older ones', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.current, 2))
    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.current, 9))
    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.previous, 3))
    await markTeacherPresent(teacher.id, group.id, LONG_AGO)

    await adminSession()
    const report = await getTeacherWorkReport(teacher.id)

    expect(report.current.sessionCount).toBe(2)
    expect(report.current.totalMinutes).toBe(180)
    expect(report.current.groupCount).toBe(1)
    expect(report.previous.sessionCount).toBe(1)
    expect(report.previous.totalMinutes).toBe(90)
  })

  it('ignores a session the teacher was marked absent for', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.current, 4), true)
    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.current, 11), false)

    await adminSession()
    expect((await getTeacherWorkReport(teacher.id)).current.sessionCount).toBe(1)
  })

  it('counts a 60-minute group as one hour per session', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent({ startTime: '17:00', endTime: '18:00' })
    await createTeacherAssignment(teacher.id, group.id)
    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.current, 4))

    await adminSession()
    expect((await getTeacherWorkReport(teacher.id)).current.totalMinutes).toBe(60)
  })

  it('returns empty months for a teacher with no hours', async () => {
    const teacher = await createTeacher()
    await adminSession()

    const report = await getTeacherWorkReport(teacher.id)

    expect(report.current).toMatchObject({ sessionCount: 0, totalMinutes: 0, groupCount: 0 })
    expect(report.previous.groups).toEqual([])
  })
})

describe('bulkMarkSession — teaching hours are written with the students', () => {
  it('books the sole assigned teacher automatically', async () => {
    const teacher = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    const res = await bulkMarkSession({
      groupId: group.id,
      sessionDate: markableDateKey(0),
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
    })
    expect(res).toEqual({ success: true })

    await adminSession()
    const report = await getTeacherWorkReport(teacher.id)
    expect(report.current.sessionCount).toBe(1)
    expect(report.current.totalMinutes).toBe(90)
  })

  it('books only the teachers marked present on a two-teacher group', async () => {
    const present = await createTeacher()
    const absent = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(present.id, group.id)
    await createTeacherAssignment(absent.id, group.id)

    mockSession({ id: present.id, role: 'TEACHER', city: 'SPLIT' })
    await bulkMarkSession({
      groupId: group.id,
      sessionDate: markableDateKey(1),
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
      teacherEntries: [
        { userId: present.id, present: true },
        { userId: absent.id, present: false },
      ],
    })

    await adminSession()
    expect((await getTeacherWorkReport(present.id)).current.sessionCount).toBe(1)
    expect((await getTeacherWorkReport(absent.id)).current.sessionCount).toBe(0)
  })

  it('books nobody when two teachers are assigned and none were marked', async () => {
    const first = await createTeacher()
    const second = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(first.id, group.id)
    await createTeacherAssignment(second.id, group.id)

    mockSession({ id: first.id, role: 'TEACHER', city: 'SPLIT' })
    await bulkMarkSession({
      groupId: group.id,
      sessionDate: markableDateKey(2),
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
    })

    await adminSession()
    expect((await getTeacherWorkReport(first.id)).current.sessionCount).toBe(0)
    expect((await getTeacherWorkReport(second.id)).current.sessionCount).toBe(0)
  })

  it('refuses to book someone who is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const outsider = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)
    await createTeacherAssignment(await createTeacher().then((t) => t.id), group.id)

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    await bulkMarkSession({
      groupId: group.id,
      sessionDate: markableDateKey(3),
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
      teacherEntries: [{ userId: outsider.id, present: true }],
    })

    await adminSession()
    expect((await getTeacherWorkReport(outsider.id)).current.sessionCount).toBe(0)
  })

  it('an admin marking the session does not book herself', async () => {
    const teacher = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    await bulkMarkSession({
      groupId: group.id,
      sessionDate: markableDateKey(4),
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
    })

    // The group's teacher is credited; the admin who typed it is not.
    expect((await getTeacherWorkReport(teacher.id)).current.sessionCount).toBe(1)
    expect((await getTeacherWorkReport(admin.id)).current.sessionCount).toBe(0)
  })

  it('re-marking the same session keeps one row, not two', async () => {
    const teacher = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)
    const sessionDate = markableDateKey(5)

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    for (const present of [true, false, true]) {
      await bulkMarkSession({
        groupId: group.id,
        sessionDate,
        entries: [{ enrollmentId: enrollment.id, present, note: null }],
      })
    }

    await adminSession()
    expect((await getTeacherWorkReport(teacher.id)).current.sessionCount).toBe(1)
  })
})

// Teaching hours are the payout basis, so a teacher may only record the current
// month up to today — no marking classes that haven't happened, and no filling
// in a whole month after the fact. Admins keep the unrestricted correction path.
describe('bulkMarkSession — the teacher marking window', () => {
  async function teacherOnGroup() {
    const teacher = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    return { teacher, group, enrollment }
  }

  function mark(groupId: string, enrollmentId: string, sessionDate: string) {
    return bulkMarkSession({
      groupId,
      sessionDate,
      entries: [{ enrollmentId, present: true, note: null }],
    })
  }

  /** `daysAhead` days after today, in the same Zagreb-anchored key format. */
  function futureDateKey(daysAhead: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + daysAhead)
    return zagrebDateKey(d)
  }

  it('rejects a future session and writes nothing', async () => {
    const { teacher, group, enrollment } = await teacherOnGroup()

    const res = await mark(group.id, enrollment.id, futureDateKey(3))

    expect(res.success).toBe(false)
    expect(res.success === false && res.error).toMatch(/budući termin/)
    // Neither the student roster nor the teacher's hours may be touched.
    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
    await adminSession()
    expect((await getTeacherWorkReport(teacher.id)).current.sessionCount).toBe(0)
  })

  it('rejects a session in the previous month', async () => {
    const { teacher, group, enrollment } = await teacherOnGroup()

    const res = await mark(group.id, enrollment.id, dateKeyOf(WINDOWS.previous, 15))

    expect(res.success).toBe(false)
    expect(res.success === false && res.error).toMatch(/tekućeg mjeseca/)
    await adminSession()
    expect((await getTeacherWorkReport(teacher.id)).previous.sessionCount).toBe(0)
  })

  it('accepts today', async () => {
    const { teacher, group, enrollment } = await teacherOnGroup()

    expect(await mark(group.id, enrollment.id, markableDateKey(0))).toEqual({ success: true })

    await adminSession()
    expect((await getTeacherWorkReport(teacher.id)).current.sessionCount).toBe(1)
  })

  it('accepts the 1st of the current month', async () => {
    const { group, enrollment } = await teacherOnGroup()
    const firstOfMonth = `${zagrebDateKey(new Date()).slice(0, 8)}01`

    expect(await mark(group.id, enrollment.id, firstOfMonth)).toEqual({ success: true })
  })

  it('lets an ADMIN record a previous-month session the teacher cannot', async () => {
    const teacher = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)
    const pastDate = dateKeyOf(WINDOWS.previous, 12)

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    expect((await mark(group.id, enrollment.id, pastDate)).success).toBe(false)

    const admin = await adminSession()
    expect(await mark(group.id, enrollment.id, pastDate)).toEqual({ success: true })
    expect(
      await db.attendance.count({
        where: { enrollmentId: enrollment.id, sessionDate: new Date(`${pastDate}T00:00:00.000Z`) },
      }),
    ).toBe(1)
    // The admin is not assigned to the group, so no hours are booked for them.
    expect((await getTeacherWorkReport(admin.id)).previous.sessionCount).toBe(0)
  })
})

describe('hours survive the assignment', () => {
  it('keeps the teacher’s hours after they are removed from the group', async () => {
    const teacher = await createTeacher()
    const { group, enrollment } = await groupWithStudent()
    const assignment = await createTeacherAssignment(teacher.id, group.id)

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    await bulkMarkSession({
      groupId: group.id,
      sessionDate: markableDateKey(6),
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
    })

    await adminSession()
    expect(await unassignTeacherFromGroup(assignment.id)).toEqual({ success: true })

    const report = await getTeacherWorkReport(teacher.id)
    expect(report.current.sessionCount).toBe(1)
    expect(report.current.totalMinutes).toBe(90)
    expect(report.current.groups[0].groupId).toBe(group.id)
  })
})

describe('getTeacherWorkReport — city scoping', () => {
  it('404s on a teacher from the other city', async () => {
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await adminSession('SIBENIK')

    await expect(getTeacherWorkReport(splitTeacher.id)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('ignores hours booked on a group outside the admin city', async () => {
    const teacher = await createTeacher({ city: 'SIBENIK' })
    const { group } = await groupWithStudent({ city: 'SPLIT' })
    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS.current, 12))

    await adminSession('SIBENIK')
    expect((await getTeacherWorkReport(teacher.id)).current.sessionCount).toBe(0)
  })
})
