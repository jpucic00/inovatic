import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import {
  REPORT_MONTH_COUNT,
  recentMonthWindows,
  type MonthWindow,
  type TeacherWorkReport,
} from '@/lib/teacher-work-report'
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
const { getTeacherWorkReport, updateTeacherHourlyRate } = await import(
  '@/actions/admin/teacher-work'
)
const { bulkMarkSession } = await import('@/actions/teacher/attendance')
const { unassignTeacherFromGroup } = await import('@/actions/admin/teacher')

const SY = '2026/2027'
const WINDOWS = recentMonthWindows(new Date())
const CURRENT = WINDOWS[0]
const PREVIOUS = WINDOWS[1]
const OLDEST = WINDOWS[WINDOWS.length - 1]
const DAY_MS = 86_400_000

/** Nth day (1-based) of a report window, as a UTC-midnight date. */
function dayOf(window: { year: number; month: number }, day: number): Date {
  return new Date(Date.UTC(window.year, window.month - 1, day))
}

function dateKeyOf(window: { year: number; month: number }, day: number): string {
  return dayOf(window, day).toISOString().slice(0, 10)
}

/** A date safely before the oldest reported month. */
const BEFORE_WINDOW = new Date(dayOf(OLDEST, 1).getTime() - 40 * DAY_MS)

/** The report block for one window — never by array position. */
function monthOf(report: TeacherWorkReport, window: MonthWindow) {
  const found = report.months.find((m) => m.window.startKey === window.startKey)
  if (!found) throw new Error(`no month ${window.startKey} in the report`)
  return found
}

/** Shorthand for the overwhelmingly common assertion target. */
async function currentMonth(userId: string) {
  return monthOf(await getTeacherWorkReport(userId), CURRENT)
}

// The report deliberately carries no totals of its own — a six-month sum is not
// a figure anyone pays out. Tests that want one add it up here.
const sumSessions = (r: TeacherWorkReport) =>
  r.months.reduce((sum, m) => sum + m.sessionCount, 0)
const sumMinutes = (r: TeacherWorkReport) =>
  r.months.reduce((sum, m) => sum + m.totalMinutes, 0)
const sumAmountCents = (r: TeacherWorkReport) =>
  r.months.reduce((sum, m) => sum + (m.amountCents ?? 0), 0)

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
  it('splits sessions across the reported months, ignoring older ones', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 2))
    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 9))
    await markTeacherPresent(teacher.id, group.id, dayOf(PREVIOUS, 3))
    await markTeacherPresent(teacher.id, group.id, BEFORE_WINDOW)

    await adminSession()
    const report = await getTeacherWorkReport(teacher.id)

    expect(monthOf(report, CURRENT).sessionCount).toBe(2)
    expect(monthOf(report, CURRENT).totalMinutes).toBe(180)
    expect(monthOf(report, CURRENT).groupCount).toBe(1)
    expect(monthOf(report, PREVIOUS).sessionCount).toBe(1)
    expect(monthOf(report, PREVIOUS).totalMinutes).toBe(90)
    // The row before the window is dropped, not folded into the oldest month.
    expect(sumSessions(report)).toBe(3)
  })

  it('reaches back six months — a session four months ago is still reported', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    await markTeacherPresent(teacher.id, group.id, dayOf(WINDOWS[3], 10))
    await markTeacherPresent(teacher.id, group.id, dayOf(OLDEST, 5))

    await adminSession()
    const report = await getTeacherWorkReport(teacher.id)

    expect(report.months).toHaveLength(REPORT_MONTH_COUNT)
    expect(monthOf(report, WINDOWS[3]).sessionCount).toBe(1)
    expect(monthOf(report, OLDEST).sessionCount).toBe(1)
    expect(sumMinutes(report)).toBe(180)
  })

  it('ignores a session the teacher was marked absent for', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)

    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 4), true)
    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 11), false)

    await adminSession()
    expect((await currentMonth(teacher.id)).sessionCount).toBe(1)
  })

  it('counts a 60-minute group as one hour per session', async () => {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent({ startTime: '17:00', endTime: '18:00' })
    await createTeacherAssignment(teacher.id, group.id)
    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 4))

    await adminSession()
    expect((await currentMonth(teacher.id)).totalMinutes).toBe(60)
  })

  it('returns empty months for a teacher with no hours', async () => {
    const teacher = await createTeacher()
    await adminSession()

    const report = await getTeacherWorkReport(teacher.id)

    expect(report.months).toHaveLength(REPORT_MONTH_COUNT)
    expect(sumSessions(report)).toBe(0)
    expect(sumMinutes(report)).toBe(0)
    expect(report.months.every((m) => m.groups.length === 0)).toBe(true)
  })
})

describe('teacher hourly rate — the payout amount', () => {
  /** Teacher with exactly two 90-minute sessions in the current month. */
  async function teacherWithThreeHours() {
    const teacher = await createTeacher()
    const { group } = await groupWithStudent()
    await createTeacherAssignment(teacher.id, group.id)
    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 2))
    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 9))
    return teacher
  }

  it('shows hours but no amount until a rate is set', async () => {
    const teacher = await teacherWithThreeHours()

    await adminSession()
    const report = await getTeacherWorkReport(teacher.id)

    expect(report.rateCents).toBeNull()
    expect(report.months.every((m) => m.amountCents === null)).toBe(true)
    expect(monthOf(report, CURRENT).totalMinutes).toBe(180)
    expect(monthOf(report, CURRENT).amountCents).toBeNull()
  })

  it('prices the report once a rate is set', async () => {
    const teacher = await teacherWithThreeHours()

    await adminSession()
    expect(
      await updateTeacherHourlyRate({ id: teacher.id, hourlyRateCents: '12,50' }),
    ).toEqual({ success: true })

    const report = await getTeacherWorkReport(teacher.id)
    expect(report.rateCents).toBe(1250)
    // 3 h at 12,50 €/h.
    expect(monthOf(report, CURRENT).amountCents).toBe(3750)
    expect(sumAmountCents(report)).toBe(3750)
  })

  it('clears the rate on a blank input, keeping the hours', async () => {
    const teacher = await teacherWithThreeHours()

    await adminSession()
    await updateTeacherHourlyRate({ id: teacher.id, hourlyRateCents: '12,50' })
    expect(await updateTeacherHourlyRate({ id: teacher.id, hourlyRateCents: '' })).toEqual({
      success: true,
    })

    const report = await getTeacherWorkReport(teacher.id)
    expect(report.rateCents).toBeNull()
    expect(report.months.every((m) => m.amountCents === null)).toBe(true)
    expect(monthOf(report, CURRENT).totalMinutes).toBe(180)
  })

  it('rejects a malformed rate without touching the stored one', async () => {
    const teacher = await teacherWithThreeHours()

    await adminSession()
    await updateTeacherHourlyRate({ id: teacher.id, hourlyRateCents: '12,50' })
    const res = await updateTeacherHourlyRate({ id: teacher.id, hourlyRateCents: 'abc' })

    expect(res.success).toBe(false)
    expect((await getTeacherWorkReport(teacher.id)).rateCents).toBe(1250)
  })

  it('can pay a teaching ADMIN — Šibenik’s only teacher is its admin', async () => {
    const slavica = await createAdmin({ city: 'SIBENIK' })
    const { group } = await groupWithStudent({ city: 'SIBENIK' })
    await createTeacherAssignment(slavica.id, group.id)
    await markTeacherPresent(slavica.id, group.id, dayOf(CURRENT, 6))

    await adminSession('SIBENIK')
    expect(
      await updateTeacherHourlyRate({ id: slavica.id, hourlyRateCents: '20' }),
    ).toEqual({ success: true })

    expect((await currentMonth(slavica.id)).amountCents).toBe(3000)
  })

  it('404s when setting a rate on a teacher from the other city', async () => {
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await adminSession('SIBENIK')

    await expect(
      updateTeacherHourlyRate({ id: splitTeacher.id, hourlyRateCents: '12,50' }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
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
    const current = await currentMonth(teacher.id)
    expect(current.sessionCount).toBe(1)
    expect(current.totalMinutes).toBe(90)
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
    expect((await currentMonth(present.id)).sessionCount).toBe(1)
    expect((await currentMonth(absent.id)).sessionCount).toBe(0)
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
    expect((await currentMonth(first.id)).sessionCount).toBe(0)
    expect((await currentMonth(second.id)).sessionCount).toBe(0)
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
    expect((await currentMonth(outsider.id)).sessionCount).toBe(0)
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
    expect((await currentMonth(teacher.id)).sessionCount).toBe(1)
    expect((await currentMonth(admin.id)).sessionCount).toBe(0)
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
    expect((await currentMonth(teacher.id)).sessionCount).toBe(1)
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
    expect((await currentMonth(teacher.id)).sessionCount).toBe(0)
  })

  it('rejects a session in the previous month', async () => {
    const { teacher, group, enrollment } = await teacherOnGroup()

    const res = await mark(group.id, enrollment.id, dateKeyOf(PREVIOUS, 15))

    expect(res.success).toBe(false)
    expect(res.success === false && res.error).toMatch(/tekućeg mjeseca/)
    await adminSession()
    expect(monthOf(await getTeacherWorkReport(teacher.id), PREVIOUS).sessionCount).toBe(0)
  })

  it('accepts today', async () => {
    const { teacher, group, enrollment } = await teacherOnGroup()

    expect(await mark(group.id, enrollment.id, markableDateKey(0))).toEqual({ success: true })

    await adminSession()
    expect((await currentMonth(teacher.id)).sessionCount).toBe(1)
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
    const pastDate = dateKeyOf(PREVIOUS, 12)

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
    expect(monthOf(await getTeacherWorkReport(admin.id), PREVIOUS).sessionCount).toBe(0)
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

    const current = await currentMonth(teacher.id)
    expect(current.sessionCount).toBe(1)
    expect(current.totalMinutes).toBe(90)
    expect(current.groups[0].groupId).toBe(group.id)
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
    await markTeacherPresent(teacher.id, group.id, dayOf(CURRENT, 12))

    await adminSession('SIBENIK')
    expect((await currentMonth(teacher.id)).sessionCount).toBe(0)
  })
})
