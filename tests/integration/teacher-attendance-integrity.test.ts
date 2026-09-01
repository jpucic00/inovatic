/**
 * `TeacherAttendance` rows are the sole basis for hourly teacher payout, so no
 * admin action may destroy them silently. Two paths used to:
 *
 *   1. Marking a date as a holiday cascaded the student `Attendance` rows but
 *      left the teacher's booked hour behind — still billable on a day the
 *      lesson provably did not happen, and understated in the confirm dialog.
 *   2. `deleteGroup` / `deleteCourse` had no blocker for them and the FK was
 *      `Cascade`, so a group with hours but an empty roster (reachable —
 *      `bulkMarkSession` books the teacher even with no students enrolled)
 *      passed every guard and took the payout evidence with it.
 *
 * The holiday cascade now removes both ledgers together; the delete paths now
 * refuse, backed by `onDelete: Restrict` so the database says no even if a
 * future code path forgets the guard.
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
  createTeacherAttendance,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { upsertHoliday, bulkImportHolidays } = await import('@/actions/admin/holidays')
const { deleteGroup } = await import('@/actions/admin/group')
const { deleteCourse } = await import('@/actions/admin/course')
const { bulkMarkSession } = await import('@/actions/teacher/attendance')

const SY = '2026/2027'
// The cascade counts by (date, schoolYear, city), not by fixture id, so this
// date is deliberately one no other file in the tier touches — a stray row left
// behind elsewhere would otherwise inflate the counts asserted here.
const SESSION_DATE = new Date(Date.UTC(2027, 3, 12)) // 2027-04-12
const SESSION_KEY = '2027-04-12'

const fixtures = fixtureScope()

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

afterEach(async () => {
  await db.schoolYearHoliday.deleteMany({})
  await fixtures.cleanup()
})

/** A group with one teacher who has booked an hour on SESSION_DATE. */
async function groupWithBookedHours(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const teacher = await createTeacher({ city })
  const course = await fixtures.course({ kind: 'STANDARD' })
  const location = await fixtures.location({ city })
  const group = await fixtures.group({
    courseId: course.id,
    locationId: location.id,
    schoolYear: SY,
    city,
  })
  const hours = await createTeacherAttendance(teacher.id, group.id, {
    sessionDate: SESSION_DATE,
  })
  return { teacher, course, group, hours }
}

describe('holiday cascade — teacher hours go with the lesson', () => {
  it('counts teacher rows in the confirmation, so the dialog states the real blast radius', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await groupWithBookedHours()

    const res = await upsertHoliday({ schoolYear: SY, date: SESSION_KEY })
    expect(res.success).toBe(true)
    if (!res.success || !res.requiresConfirmation) {
      throw new Error('expected a confirmation — a booked teacher hour is a conflict')
    }
    // Before the fix this was 0: no student rows existed, so the holiday was
    // written with no warning and the hour stayed billable.
    expect(res.attendanceCount).toBe(1)
  })

  it('deletes the teacher rows in the same transaction as the student rows', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const { group, teacher } = await groupWithBookedHours()
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await db.attendance.create({
      data: { enrollmentId: enrollment.id, recordedById: teacher.id, sessionDate: SESSION_DATE, present: true },
    })

    const res = await upsertHoliday({
      schoolYear: SY,
      date: SESSION_KEY,
      name: 'Božić',
      confirmDeleteAttendance: true,
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('a Šibenik holiday never touches Split teacher hours', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const split = await groupWithBookedHours('SPLIT')
    const sibenik = await groupWithBookedHours('SIBENIK')

    const res = await upsertHoliday({
      schoolYear: SY,
      date: SESSION_KEY,
      confirmDeleteAttendance: true,
    })
    expect(res.success).toBe(true)

    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: sibenik.group.id } })).toBe(0)
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: split.group.id } })).toBe(1)
  })

  it('only clears the matching school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const OTHER_SY = '2027/2028'
    await db.schoolYear.upsert({
      where: { label: OTHER_SY },
      create: { label: OTHER_SY },
      update: {},
    })
    const thisYear = await groupWithBookedHours()
    const teacher = await createTeacher()
    const otherGroup = await fixtures.group({ schoolYear: OTHER_SY })
    await createTeacherAttendance(teacher.id, otherGroup.id, { sessionDate: SESSION_DATE })

    await upsertHoliday({ schoolYear: SY, date: SESSION_KEY, confirmDeleteAttendance: true })

    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: thisYear.group.id } })).toBe(0)
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: otherGroup.id } })).toBe(1)
  })

  it('bulkImportHolidays treats a booked hour as a conflict and clears it on confirm', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const { group } = await groupWithBookedHours()

    const preview = await bulkImportHolidays({
      schoolYear: SY,
      items: [{ kind: 'single', date: SESSION_KEY, name: 'Božić' }],
    })
    expect(preview.success).toBe(true)
    if (!preview.success || !preview.requiresConfirmation) {
      throw new Error('expected the import to stop for confirmation')
    }
    expect(preview.conflictDates).toContain(SESSION_KEY)
    // Nothing written while unconfirmed.
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: group.id } })).toBe(1)

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [{ kind: 'single', date: SESSION_KEY, name: 'Božić' }],
      confirmDeleteAttendance: true,
    })
    expect(res.success).toBe(true)
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })
})

describe('deleteGroup — booked hours are a blocker', () => {
  it('refuses a group with teacher hours even when no student is enrolled', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const { group } = await groupWithBookedHours()
    expect(await db.enrollment.count({ where: { scheduledGroupId: group.id } })).toBe(0)

    const res = await deleteGroup(group.id)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/sate rada nastavnika/i)

    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: group.id } })).toBe(1)
  })

  it('still deletes a group that has none', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const group = await fixtures.group({ schoolYear: SY })

    const res = await deleteGroup(group.id)
    expect(res).toEqual({ success: true })
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(0)
  })

  it('the database refuses too — the FK is RESTRICT, not Cascade', async () => {
    const { group } = await groupWithBookedHours()

    // The backstop for any future path that skips the guard above.
    await expect(db.scheduledGroup.delete({ where: { id: group.id } })).rejects.toThrow()
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: group.id } })).toBe(1)
  })
})

describe('deleteCourse — a radionica cannot take booked hours with it', () => {
  it('refuses when one of its groups has teacher hours', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fixtures.course({ kind: 'RADIONICA', city: 'SPLIT', schoolYear: SY })
    const group = await fixtures.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })
    const teacher = await createTeacher()
    await createTeacherAttendance(teacher.id, group.id, { sessionDate: SESSION_DATE })

    const res = await deleteCourse(course.id)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/sate rada nastavnika/i)

    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: group.id } })).toBe(1)
  })

  it('still deletes a radionica whose groups have none', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fixtures.course({ kind: 'RADIONICA', city: 'SPLIT', schoolYear: SY })
    const group = await fixtures.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })

    const res = await deleteCourse(course.id)
    expect(res).toEqual({ success: true })
    expect(await db.course.count({ where: { id: course.id } })).toBe(0)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(0)
  })
})

describe('re-saving a session — booked hours ride through a growing roster', () => {
  it('keeps the teacher booked when a late enrollee is saved onto a recorded session', async () => {
    // The blank-start marker keeps Save live on a partially-recorded session (a
    // student enrolled after the first save has no row), and that save sends
    // the WHOLE roster again. The teacher's hour must ride through untouched —
    // bulkMarkSession has no delete path, and this pins it: an un-booked
    // session is a lost payout hour noticed a month later.
    const admin = await createAdmin()
    const teacher = await createTeacher({ city: 'SPLIT' })
    const course = await fixtures.course({ kind: 'STANDARD' })
    const location = await fixtures.location({ city: 'SPLIT' })
    const group = await fixtures.group({
      courseId: course.id,
      locationId: location.id,
      schoolYear: SY,
      city: 'SPLIT',
    })
    await createTeacherAssignment(teacher.id, group.id)

    const first = await createStudent()
    const enrA = await createEnrollment(first.id, group.id, { schoolYear: SY })

    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    // First save: single assigned teacher → auto-booked present, no UI entry.
    const save1 = await bulkMarkSession({
      groupId: group.id,
      sessionDate: SESSION_KEY,
      entries: [{ enrollmentId: enrA.id, present: true }],
    })
    expect(save1.success).toBe(true)
    const booked = await db.teacherAttendance.findFirst({
      where: { userId: teacher.id, scheduledGroupId: group.id },
    })
    expect(booked?.present).toBe(true)

    // A child enrolls after the fact; the re-save covers the whole roster.
    const late = await createStudent()
    const enrB = await createEnrollment(late.id, group.id, { schoolYear: SY })
    const save2 = await bulkMarkSession({
      groupId: group.id,
      sessionDate: SESSION_KEY,
      entries: [
        { enrollmentId: enrA.id, present: true },
        { enrollmentId: enrB.id, present: false },
      ],
    })
    expect(save2.success).toBe(true)

    // Exactly one teacher row, still present — re-saving upserted, never wiped.
    const after = await db.teacherAttendance.findMany({
      where: { userId: teacher.id, scheduledGroupId: group.id },
    })
    expect(after).toHaveLength(1)
    expect(after[0].present).toBe(true)
    // …and the late child's absence row now exists.
    expect(
      await db.attendance.findFirst({ where: { enrollmentId: enrB.id } }),
    ).toMatchObject({ present: false })
  })
})
