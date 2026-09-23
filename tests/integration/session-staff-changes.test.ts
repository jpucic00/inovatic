/**
 * Teacher roles (predavač / asistent) and per-termin staff changes.
 *
 * A change is admin-only, covers its own date and nothing else, and is the
 * one input that decides both who a substitute may open and whose hour a
 * saved termin books — so a substitute is paid, the teacher they replaced is
 * not, and the group leaves the substitute's panel the day after on its own.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createStudent,
  createTeacher,
  createTeacherAssignment,
  relativeDateKey,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import { fromDateKey } from '@/lib/session-dates'
import { zagrebDateKey } from '@/lib/attendance-window'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const {
  addSessionStaffChange,
  removeSessionStaffChange,
  setTeacherAssignmentRole,
  getGroupStaffChanges,
  getGroupTerminSections,
} = await import('@/actions/admin/session-staff')
const { bulkMarkSession } = await import('@/actions/teacher/attendance')
const { getMyAssignedGroups } = await import('@/actions/teacher/dashboard')
const { assertTeacherOwnsGroup } = await import('@/lib/teacher-guard')
const { upsertHoliday } = await import('@/actions/admin/holidays')
const { deleteGroup } = await import('@/actions/admin/group')
const { deleteTeacher } = await import('@/actions/admin/teacher')

const SY = '2026/2027'
// A Monday — the factory's default group weekday — no other file uses.
const MONDAY = '2027-03-15'
const TUESDAY = '2027-03-16'
const NEXT_MONDAY = '2027-03-22'

const fixtures = fixtureScope()

/** Days from today on the Europe/Zagreb calendar, which is what the access rule reads. */
function zagrebDaysFromToday(days: number): string {
  const d = fromDateKey(zagrebDateKey(new Date()))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const CROATIAN_WEEKDAYS = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota']

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

afterEach(async () => {
  await db.schoolYearHoliday.deleteMany({ where: { schoolYear: SY, date: fromDateKey(MONDAY) } })
  await fixtures.cleanup()
})

async function staffedGroup(city: 'SPLIT' | 'SIBENIK' = 'SPLIT', schoolYear = SY) {
  const admin = await createAdmin({ city })
  const lead = await createTeacher({ city, firstName: 'Ivo', lastName: 'Horvat' })
  const substitute = await createTeacher({ city, firstName: 'Marko', lastName: 'Marić' })
  const location = await fixtures.location({ city })
  const group = await fixtures.group({ locationId: location.id, schoolYear, city })
  const assignment = await createTeacherAssignment(lead.id, group.id)
  return { admin, lead, substitute, group, assignment }
}

describe('only an admin changes staff', () => {
  it('refuses a teacher adding a zamjena', async () => {
    const { lead, substitute, group } = await staffedGroup()
    mockSession({ id: lead.id, role: 'TEACHER' })
    await expect(
      addSessionStaffChange({
        scheduledGroupId: group.id,
        sessionDates: [MONDAY],
        userId: substitute.id,
        role: 'LEAD',
        replacesUserId: lead.id,
      }),
    ).rejects.toThrow()
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('refuses a teacher changing a role', async () => {
    const { lead, assignment } = await staffedGroup()
    mockSession({ id: lead.id, role: 'TEACHER' })
    await expect(
      setTeacherAssignmentRole({ assignmentId: assignment.id, role: 'ASSISTANT' }),
    ).rejects.toThrow()
  })
})

describe('roles', () => {
  it('a new assignment is a predavač, and an admin can make it an asistent', async () => {
    const { admin, assignment } = await staffedGroup()
    expect(assignment.role).toBe('LEAD')
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await setTeacherAssignmentRole({ assignmentId: assignment.id, role: 'ASSISTANT' })
    expect(res.success).toBe(true)
    const row = await db.teacherAssignment.findUniqueOrThrow({ where: { id: assignment.id } })
    expect(row.role).toBe('ASSISTANT')
  })

  it('another city cannot touch the role', async () => {
    const { assignment } = await staffedGroup('SPLIT')
    const other = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: other.id, role: 'ADMIN', city: 'SIBENIK' })
    const res = await setTeacherAssignmentRole({ assignmentId: assignment.id, role: 'ASSISTANT' })
    expect(res.success).toBe(false)
  })
})

describe('adding a zamjena', () => {
  it('records it for that termin', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res).toEqual({ success: true })
    const changes = await getGroupStaffChanges(group.id)
    expect(changes).toMatchObject([
      { sessionDate: MONDAY, userId: substitute.id, replacesName: 'Ivo Horvat', role: 'LEAD' },
    ])
  })

  it('covers several termini in one go', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [NEXT_MONDAY, MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res).toEqual({ success: true })
    const changes = await getGroupStaffChanges(group.id)
    expect(changes.map((c) => c.sessionDate)).toEqual([MONDAY, NEXT_MONDAY])
  })

  it('writes none of the dates when one of them cannot stand', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY, TUESDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res).toEqual({
      success: false,
      error: '16.03.2027.: Grupa se održava samo na dan: Ponedjeljak.',
    })
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('refuses a day the group does not meet', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [TUESDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res.success).toBe(false)
  })

  it('refuses a substitute from the other city', async () => {
    const { admin, lead, group } = await staffedGroup('SPLIT')
    const foreign = await createTeacher({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: foreign.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res).toEqual({ success: false, error: 'Nastavnik nije pronađen.' })
  })

  it('refuses replacing someone who is not on the group', async () => {
    const { admin, substitute, group } = await staffedGroup()
    const stranger = await createTeacher()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: stranger.id,
    })
    expect(res.success).toBe(false)
  })

  it('refuses a second substitute for the same teacher on one termin', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    const another = await createTeacher()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const base = { scheduledGroupId: group.id, sessionDates: [MONDAY], role: 'LEAD' as const, replacesUserId: lead.id }
    expect((await addSessionStaffChange({ ...base, userId: substitute.id })).success).toBe(true)
    expect((await addSessionStaffChange({ ...base, userId: another.id })).success).toBe(false)
  })

  it('removing it leaves hours already booked in place', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    await db.teacherAttendance.create({
      data: {
        userId: substitute.id,
        scheduledGroupId: group.id,
        sessionDate: fromDateKey(MONDAY),
        present: true,
        recordedById: admin.id,
      },
    })
    const [change] = await getGroupStaffChanges(group.id)
    expect((await removeSessionStaffChange(change.id)).success).toBe(true)
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(0)
    expect(await db.teacherAttendance.count({ where: { userId: substitute.id } })).toBe(1)
  })
})

describe('booking hours on a covered termin', () => {
  it('books the substitute, never the teacher they replace', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    mockSession({ id: admin.id, role: 'ADMIN' })
    await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })

    // A single-staff termin: nothing is sent, the server books whoever it is.
    const res = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MONDAY,
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
    })
    expect(res).toEqual({ success: true })

    const booked = await db.teacherAttendance.findMany({
      where: { scheduledGroupId: group.id },
      select: { userId: true },
    })
    expect(booked.map((b) => b.userId)).toEqual([substitute.id])
  })

  it('ignores an entry for the replaced teacher', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    mockSession({ id: admin.id, role: 'ADMIN' })
    await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    await bulkMarkSession({
      groupId: group.id,
      sessionDate: MONDAY,
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
      teacherEntries: [
        { userId: lead.id, present: true },
        { userId: substitute.id, present: true },
      ],
    })
    const booked = await db.teacherAttendance.findMany({ where: { scheduledGroupId: group.id } })
    expect(booked.map((b) => b.userId)).toEqual([substitute.id])
  })
})

describe('substitute access ends with the termin', () => {
  // Written directly: the access rule reads only the date, and relative dates
  // keep these tests from expiring.
  async function coverOn(dateKey: string) {
    const ctx = await staffedGroup()
    await db.sessionStaffChange.create({
      data: {
        scheduledGroupId: ctx.group.id,
        sessionDate: fromDateKey(dateKey),
        userId: ctx.substitute.id,
        role: 'LEAD',
        replacesUserId: ctx.lead.id,
        createdById: ctx.admin.id,
      },
    })
    mockSession({ id: ctx.substitute.id, role: 'TEACHER' })
    return ctx
  }

  it('opens the group before the termin and lists it with the date', async () => {
    const { group } = await coverOn(relativeDateKey(3))
    await expect(assertTeacherOwnsGroup(group.id)).resolves.toBeDefined()
    const mine = await getMyAssignedGroups()
    expect(mine.find((g) => g.id === group.id)).toMatchObject({
      myRole: null,
      myChangeDates: [relativeDateKey(3)],
    })
  })

  it('closes the group the day after', async () => {
    const { group } = await coverOn(relativeDateKey(-1))
    await expect(assertTeacherOwnsGroup(group.id)).rejects.toThrow()
    const mine = await getMyAssignedGroups()
    expect(mine.some((g) => g.id === group.id)).toBe(false)
  })
})

describe('the change goes with its termin', () => {
  it('a holiday on that date removes it', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    const res = await upsertHoliday({ schoolYear: SY, date: MONDAY })
    expect(res.success).toBe(true)
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('does not block deleting the group', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(await deleteGroup(group.id)).toEqual({ success: true })
  })
})

describe('the action holds the picker date bounds', () => {
  it('refuses a termin that has already passed', async () => {
    // Yesterday, on a group that meets on yesterday's weekday in yesterday's
    // school year — so only the date bound can be what refuses it.
    const yesterday = zagrebDaysFromToday(-1)
    const [y, m] = yesterday.split('-').map(Number)
    const schoolYear = m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
    await db.schoolYear.upsert({ where: { label: schoolYear }, create: { label: schoolYear }, update: {} })
    const admin = await createAdmin()
    const lead = await createTeacher()
    const substitute = await createTeacher()
    const location = await fixtures.location({ city: 'SPLIT' })
    const group = await fixtures.group({
      locationId: location.id,
      city: 'SPLIT',
      schoolYear,
      dayOfWeek: CROATIAN_WEEKDAYS[fromDateKey(yesterday).getUTCDay()],
    })
    await createTeacherAssignment(lead.id, group.id)
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [yesterday],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/termin je već prošao|arhiv/i)
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('refuses a date outside the group school year', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addSessionStaffChange({
      scheduledGroupId: group.id,
      // A Monday in 2027/2028, a year after the group's.
      sessionDates: [MONDAY, '2027-09-13'],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    expect(res).toEqual({
      success: false,
      error: '13.09.2027.: termin nije u školskoj godini grupe.',
    })
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })
})

describe('deleting a teacher', () => {
  it('drops their zamjene from today on and keeps the past ones as history', async () => {
    const { admin, lead, substitute, group } = await staffedGroup()
    for (const days of [-7, 7]) {
      await db.sessionStaffChange.create({
        data: {
          scheduledGroupId: group.id,
          sessionDate: fromDateKey(zagrebDaysFromToday(days)),
          userId: substitute.id,
          role: 'LEAD',
          replacesUserId: lead.id,
          createdById: admin.id,
        },
      })
    }
    mockSession({ id: admin.id, role: 'ADMIN' })
    expect(await deleteTeacher(substitute.id)).toEqual({ success: true })
    const left = await db.sessionStaffChange.findMany({ where: { userId: substitute.id } })
    expect(left.map((c) => c.sessionDate.toISOString().slice(0, 10))).toEqual([
      zagrebDaysFromToday(-7),
    ])
  })
})

describe('the substitute on their own termin', () => {
  // Today, on today's weekday: the only date that is both inside the teacher
  // marking window and still inside the substitute's access window.
  async function coveredToday() {
    const today = zagrebDaysFromToday(0)
    const city = 'SPLIT' as const
    const admin = await createAdmin({ city })
    const lead = await createTeacher({ city })
    const substitute = await createTeacher({ city })
    const location = await fixtures.location({ city })
    const group = await fixtures.group({
      locationId: location.id,
      city,
      schoolYear: SY,
      dayOfWeek: CROATIAN_WEEKDAYS[fromDateKey(today).getUTCDay()],
    })
    await createTeacherAssignment(lead.id, group.id)
    await db.sessionStaffChange.create({
      data: {
        scheduledGroupId: group.id,
        sessionDate: fromDateKey(today),
        userId: substitute.id,
        role: 'LEAD',
        replacesUserId: lead.id,
        createdById: admin.id,
      },
    })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    return { today, lead, substitute, group, enrollment }
  }

  it('can still open the group on the termin day itself', async () => {
    const { substitute, group } = await coveredToday()
    mockSession({ id: substitute.id, role: 'TEACHER' })
    await expect(assertTeacherOwnsGroup(group.id)).resolves.toBeDefined()
  })

  it('marks it as a teacher and books their own hour, not the replaced teacher', async () => {
    const { today, substitute, group, enrollment } = await coveredToday()
    mockSession({ id: substitute.id, role: 'TEACHER' })
    const res = await bulkMarkSession({
      groupId: group.id,
      sessionDate: today,
      entries: [{ enrollmentId: enrollment.id, present: true, note: null }],
    })
    expect(res).toEqual({ success: true })
    const booked = await db.teacherAttendance.findMany({
      where: { scheduledGroupId: group.id },
      select: { userId: true },
    })
    expect(booked.map((b) => b.userId)).toEqual([substitute.id])
  })
})

describe('a holiday only clears its own city', () => {
  it('a Šibenik holiday leaves a Split zamjena on the same date alone', async () => {
    const { admin, lead, substitute, group } = await staffedGroup('SPLIT')
    mockSession({ id: admin.id, role: 'ADMIN' })
    await addSessionStaffChange({
      scheduledGroupId: group.id,
      sessionDates: [MONDAY],
      userId: substitute.id,
      role: 'LEAD',
      replacesUserId: lead.id,
    })
    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })
    expect((await upsertHoliday({ schoolYear: SY, date: MONDAY })).success).toBe(true)
    expect(await db.sessionStaffChange.count({ where: { scheduledGroupId: group.id } })).toBe(1)
  })
})

describe('getGroupTerminSections (the zamjena picker, loaded on open)', () => {
  it('lists upcoming termini, including a date added by hand on Dolazak', async () => {
    const { admin, group } = await staffedGroup()
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    // A hand-added Dolazak date exists only as an attendance record.
    await db.attendance.create({
      data: {
        enrollmentId: enrollment.id,
        sessionDate: fromDateKey(NEXT_MONDAY),
        present: true,
        recordedById: admin.id,
      },
    })
    mockSession({ id: admin.id, role: 'ADMIN' })
    const sections = await getGroupTerminSections(group.id)
    expect(sections.flatMap((s) => s.dates)).toContain(NEXT_MONDAY)
  })

  it('refuses a teacher', async () => {
    const { lead, group } = await staffedGroup()
    mockSession({ id: lead.id, role: 'TEACHER' })
    await expect(getGroupTerminSections(group.id)).rejects.toThrow()
  })

  it('404s an admin of the other city', async () => {
    const { group } = await staffedGroup('SPLIT')
    const other = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: other.id, role: 'ADMIN', city: 'SIBENIK' })
    await expect(getGroupTerminSections(group.id)).rejects.toThrow(/NOT_FOUND|404/)
  })
})
