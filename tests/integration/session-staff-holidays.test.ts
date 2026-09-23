/**
 * A holiday cancels the termin, so a zamjena booked for that date has nothing
 * left to cover and goes with it — in the same transaction as the holiday,
 * for both the range editor and the API import. When the holiday is held back
 * for attendance confirmation the whole transaction rolls back, so the zamjena
 * stays until the admin confirms.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createAttendance,
  createEnrollment,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import { fromDateKey } from '@/lib/session-dates'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { upsertHolidayRange, bulkImportHolidays } = await import('@/actions/admin/holidays')

const SY = '2026/2027'
// Mondays — the factory's default group weekday — that no other file uses.
const MONDAY = '2027-05-10'
const NEXT_MONDAY = '2027-05-17'
const OUR_DATES = [MONDAY, NEXT_MONDAY].map(fromDateKey)

const fixtures = fixtureScope()

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

afterEach(async () => {
  await db.schoolYearHoliday.deleteMany({
    where: { schoolYear: SY, date: { gte: fromDateKey('2027-05-08'), lte: fromDateKey('2027-05-18') } },
  })
  await fixtures.cleanup()
})

/** A group with one predavač and a zamjena for them on each of `dates`. */
async function groupWithZamjena(city: 'SPLIT' | 'SIBENIK', dates: string[]) {
  const admin = await createAdmin({ city })
  const lead = await createTeacher({ city })
  const substitute = await createTeacher({ city })
  const location = await fixtures.location({ city })
  const group = await fixtures.group({ locationId: location.id, schoolYear: SY, city })
  await createTeacherAssignment(lead.id, group.id)
  for (const d of dates) {
    await db.sessionStaffChange.create({
      data: {
        scheduledGroupId: group.id,
        sessionDate: fromDateKey(d),
        userId: substitute.id,
        role: 'LEAD',
        replacesUserId: lead.id,
        createdById: admin.id,
      },
    })
  }
  return { admin, lead, substitute, group }
}

async function changeDates(groupId: string): Promise<string[]> {
  const rows = await db.sessionStaffChange.findMany({
    where: { scheduledGroupId: groupId },
    orderBy: { sessionDate: 'asc' },
    select: { sessionDate: true },
  })
  return rows.map((r) => r.sessionDate.toISOString().slice(0, 10))
}

async function holidayCount(city: 'SPLIT' | 'SIBENIK'): Promise<number> {
  return db.schoolYearHoliday.count({ where: { schoolYear: SY, city, date: { in: OUR_DATES } } })
}

describe('upsertHolidayRange', () => {
  it('deletes a zamjena on a date inside the range and nothing else', async () => {
    const { admin, group } = await groupWithZamjena('SIBENIK', [MONDAY, NEXT_MONDAY])
    // Same date in the other city: a Šibenik closure must not touch it.
    const split = await groupWithZamjena('SPLIT', [MONDAY])
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2027-05-08',
      endDate: '2027-05-12',
      name: 'Blagdan',
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    expect(await changeDates(group.id)).toEqual([NEXT_MONDAY])
    expect(await changeDates(split.group.id)).toEqual([MONDAY])
  })

  it('holds the zamjena while attendance awaits confirmation, then removes both', async () => {
    const { admin, lead, group } = await groupWithZamjena('SIBENIK', [MONDAY])
    const student = await createStudent({ city: 'SIBENIK' })
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, lead.id, { sessionDate: fromDateKey(MONDAY) })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const input = { schoolYear: SY, startDate: MONDAY, endDate: MONDAY, name: 'Blagdan' }
    const held = await upsertHolidayRange(input)
    expect(held).toEqual({ success: true, requiresConfirmation: true, attendanceCount: 1 })
    // Rolled back: no holiday, and the zamjena is still booked.
    expect(await holidayCount('SIBENIK')).toBe(0)
    expect(await changeDates(group.id)).toEqual([MONDAY])

    const confirmed = await upsertHolidayRange({ ...input, confirmDeleteAttendance: true })
    expect(confirmed).toEqual({ success: true, requiresConfirmation: false })
    expect(await changeDates(group.id)).toEqual([])
    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
    expect(await holidayCount('SIBENIK')).toBe(1)
  })
})

describe('bulkImportHolidays', () => {
  it('deletes a zamjena on an imported date', async () => {
    const { admin, group } = await groupWithZamjena('SIBENIK', [MONDAY, NEXT_MONDAY])
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [{ kind: 'single', date: MONDAY, name: 'Blagdan' }],
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false, importedCount: 1 })
    expect(await changeDates(group.id)).toEqual([NEXT_MONDAY])
  })

  it('keeps the zamjena when the import stops for confirmation, removes it on the confirmed retry', async () => {
    const { admin, lead, group } = await groupWithZamjena('SIBENIK', [MONDAY])
    const student = await createStudent({ city: 'SIBENIK' })
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, lead.id, { sessionDate: fromDateKey(MONDAY) })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const input = { schoolYear: SY, items: [{ kind: 'single' as const, date: MONDAY, name: 'Blagdan' }] }
    const held = await bulkImportHolidays(input)
    expect(held).toMatchObject({ success: true, requiresConfirmation: true, conflictDates: [MONDAY] })
    expect(await holidayCount('SIBENIK')).toBe(0)
    expect(await changeDates(group.id)).toEqual([MONDAY])

    const confirmed = await bulkImportHolidays({ ...input, confirmDeleteAttendance: true })
    expect(confirmed).toMatchObject({ success: true, requiresConfirmation: false })
    expect(await changeDates(group.id)).toEqual([])
  })
})
