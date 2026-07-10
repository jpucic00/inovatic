import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createAttendance,
  createCourse,
  createEnrollment,
  createGroup,
  createModule,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// `previewHolidaysFromApi` calls `fetchCroatianHolidays` which hits the live
// OpenHolidaysAPI over the network. The integration tier should not depend on
// outbound network access — stub the lib so the preview action returns a
// predictable Croatian-language fixture.
vi.mock('@/lib/holiday-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/holiday-api')>(
    '@/lib/holiday-api',
  )
  return {
    ...actual,
    fetchCroatianHolidays: vi.fn(async () => [
      { kind: 'single', date: '2026-12-25', name: 'Božić', category: 'public' as const },
      { kind: 'single', date: '2027-01-01', name: 'Nova Godina', category: 'public' as const },
      {
        kind: 'range',
        startDate: '2026-12-24',
        endDate: '2027-01-09',
        name: 'Zimski odmor',
        category: 'school' as const,
      },
    ]),
  }
})

const {
  upsertHoliday,
  upsertHolidayRange,
  removeHoliday,
  removeHolidayRange,
  listHolidays,
  previewHolidaysFromApi,
  bulkImportHolidays,
} = await import('@/actions/admin/holidays')
const { getGroupAttendance } = await import('@/actions/teacher/attendance')

const SY = '2026/2027' // current as of today (2026-05-25 → 2026/2027 once Sept rolls; for now matches the archived check)

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
  await db.schoolYear.upsert({
    where: { label: '2020/2021' },
    create: { label: '2020/2021' },
    update: {},
  })
})

afterEach(async () => {
  // The holiday table is small; reset between tests so cases don't bleed dates.
  await db.schoolYearHoliday.deleteMany({})
})

describe('upsertHoliday', () => {
  it('rejects callers without ADMIN role', async () => {
    mockSession({ id: 'nobody', role: 'STUDENT' })
    await expect(
      upsertHoliday({ schoolYear: SY, date: '2026-12-25', name: 'Božić' }),
    ).rejects.toThrow()
  })

  it('inserts a holiday when no attendance exists on the date', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await upsertHoliday({ schoolYear: SY, date: '2026-12-25', name: 'Božić' })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    const rows = await listHolidays(SY)
    expect(rows.find((r) => r.date === '2026-12-25')?.name).toBe('Božić')
  })

  it('updates the name when called twice for the same date', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await upsertHoliday({ schoolYear: SY, date: '2026-12-25' })
    await upsertHoliday({ schoolYear: SY, date: '2026-12-25', name: 'Božić' })

    const rows = await listHolidays(SY)
    expect(rows.filter((r) => r.date === '2026-12-25')).toHaveLength(1)
    expect(rows.find((r) => r.date === '2026-12-25')?.name).toBe('Božić')
  })

  it('returns requiresConfirmation when attendance exists and the flag is not set', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })

    const res = await upsertHoliday({ schoolYear: SY, date: '2026-12-25' })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.requiresConfirmation).toBe(true)
      if (res.requiresConfirmation) expect(res.attendanceCount).toBe(1)
    }

    // No write happened — attendance still there, no holiday row created.
    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(1)
    expect(await db.schoolYearHoliday.count({ where: { schoolYear: SY } })).toBe(0)
  })

  it('upsert preview reports the attendance count for a holiday date', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const s1 = await createStudent()
    const s2 = await createStudent()
    const e1 = await createEnrollment(s1.id, group.id, { schoolYear: SY })
    const e2 = await createEnrollment(s2.id, group.id, { schoolYear: SY })
    await createAttendance(e1.id, admin.id, {
      sessionDate: new Date('2027-01-06T00:00:00.000Z'),
    })
    await createAttendance(e2.id, admin.id, {
      sessionDate: new Date('2027-01-06T00:00:00.000Z'),
    })

    // Preview path: upsert without confirmDeleteAttendance returns the cascade
    // count instead of writing (replaces the removed countAttendanceOnDate).
    const res = await upsertHoliday({ schoolYear: SY, date: '2027-01-06' })
    expect(res.success).toBe(true)
    if (!res.success || !res.requiresConfirmation) {
      throw new Error('expected a confirmation preview with an attendance count')
    }
    expect(res.attendanceCount).toBe(2)
  })

  it('deletes attendance + inserts the holiday in one transaction when confirmDeleteAttendance is true', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })

    const res = await upsertHoliday({
      schoolYear: SY,
      date: '2026-12-25',
      name: 'Božić',
      confirmDeleteAttendance: true,
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
    expect(await db.schoolYearHoliday.count({ where: { schoolYear: SY } })).toBe(1)
  })

  it('only deletes attendance for the matching school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const OTHER_SY = '2027/2028'
    await db.schoolYear.upsert({
      where: { label: OTHER_SY },
      create: { label: OTHER_SY },
      update: {},
    })

    const course = await createCourse({ isCustom: false })
    const groupThisYear = await createGroup({ courseId: course.id, schoolYear: SY })
    const groupOtherYear = await createGroup({ courseId: course.id, schoolYear: OTHER_SY })
    const student = await createStudent()
    const eThis = await createEnrollment(student.id, groupThisYear.id, { schoolYear: SY })
    const eOther = await createEnrollment(student.id, groupOtherYear.id, {
      schoolYear: OTHER_SY,
    })
    await createAttendance(eThis.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })
    await createAttendance(eOther.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })

    const res = await upsertHoliday({
      schoolYear: SY,
      date: '2026-12-25',
      confirmDeleteAttendance: true,
    })
    expect(res.success).toBe(true)

    expect(await db.attendance.count({ where: { enrollmentId: eThis.id } })).toBe(0)
    expect(await db.attendance.count({ where: { enrollmentId: eOther.id } })).toBe(1)
  })

  it('returns the archived-year error for a year strictly before the current one', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await upsertHoliday({ schoolYear: '2020/2021', date: '2020-12-25' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
  })
})

describe('upsertHolidayRange', () => {
  it('marks every day in the range in one transaction, applying the same name', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-24',
      endDate: '2026-12-31',
      name: 'Božićni praznici',
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    const rows = await listHolidays(SY)
    const range = rows.filter((r) => r.date >= '2026-12-24' && r.date <= '2026-12-31')
    expect(range).toHaveLength(8) // 24, 25, 26, 27, 28, 29, 30, 31
    expect(range.every((r) => r.name === 'Božićni praznici')).toBe(true)
  })

  it('rejects ranges where endDate < startDate', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-31',
      endDate: '2026-12-24',
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/isti ili nakon početka/i)
  })

  it('returns combined attendanceCount across the range when not confirmed', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    for (const day of [24, 25, 26]) {
      await createAttendance(enrollment.id, admin.id, {
        sessionDate: new Date(Date.UTC(2026, 11, day)),
      })
    }

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-24',
      endDate: '2026-12-31',
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.requiresConfirmation).toBe(true)
      if (res.requiresConfirmation) expect(res.attendanceCount).toBe(3)
    }

    // No write happened.
    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(3)
    expect(
      await db.schoolYearHoliday.count({
        where: { schoolYear: SY, date: { gte: new Date(Date.UTC(2026, 11, 24)) } },
      }),
    ).toBe(0)
  })

  it('with confirmDeleteAttendance deletes attendance and inserts the whole range', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date(Date.UTC(2026, 11, 25)),
    })

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-24',
      endDate: '2026-12-26',
      name: 'Božić',
      confirmDeleteAttendance: true,
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
    expect(
      await db.schoolYearHoliday.count({
        where: { schoolYear: SY, date: { gte: new Date(Date.UTC(2026, 11, 24)) } },
      }),
    ).toBe(3)
  })

  it('refuses on an archived year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await upsertHolidayRange({
      schoolYear: '2020/2021',
      startDate: '2020-12-24',
      endDate: '2020-12-31',
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
  })

  it('treats startDate == endDate as a single-day write', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2027-05-01',
      endDate: '2027-05-01',
      name: 'Praznik rada',
    })
    expect(res).toEqual({ success: true, requiresConfirmation: false })

    const rows = await listHolidays(SY)
    expect(rows.filter((r) => r.date === '2027-05-01')).toHaveLength(1)
  })
})

describe('getGroupAttendance — honours holidays', () => {
  it('drops the holiday date from expectedSessions', async () => {
    const admin = await createAdmin()
    const teacher = await db.user.create({
      data: {
        city: 'SPLIT',
        email: `t-${Date.now()}@test.local`,
        username: `t_${Date.now()}`,
        firstName: 'T',
        lastName: 'Eacher',
        passwordHash: 'x',
        role: 'TEACHER',
      },
    })

    const course = await createCourse({ isCustom: false })
    const moduleRow = await createModule(course.id)
    // Window: 2027-01-04 (Mon) → 2027-01-25 (Mon) — 4 Mondays.
    await db.moduleSchedule.create({
      data: {
        city: 'SPLIT',
        moduleId: moduleRow.id,
        schoolYear: SY,
        startDate: new Date(Date.UTC(2027, 0, 4)),
        endDate: new Date(Date.UTC(2027, 0, 25)),
      },
    })
    const group = await createGroup({
      courseId: course.id,
      schoolYear: SY,
      dayOfWeek: 'Ponedjeljak',
    })
    await db.teacherAssignment.create({
      data: { userId: teacher.id, scheduledGroupId: group.id },
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const before = await getGroupAttendance(group.id)
    if (before.kind !== 'standard') throw new Error('expected standard kind')
    // Race-ahead arc: 7 Mondays from the module's startDate, regardless of endDate.
    expect(before.sections[0].expectedSessions).toEqual([
      '2027-01-04',
      '2027-01-11',
      '2027-01-18',
      '2027-01-25',
      '2027-02-01',
      '2027-02-08',
      '2027-02-15',
    ])

    // Mark Jan 11 as a holiday — the arc should skip it and push the 7th session one week out.
    mockSession({ id: admin.id, role: 'ADMIN' })
    await upsertHoliday({ schoolYear: SY, date: '2027-01-11', name: 'Test praznik' })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const after = await getGroupAttendance(group.id)
    if (after.kind !== 'standard') throw new Error('expected standard kind')
    expect(after.sections[0].expectedSessions).toEqual([
      '2027-01-04',
      '2027-01-18',
      '2027-01-25',
      '2027-02-01',
      '2027-02-08',
      '2027-02-15',
      '2027-02-22',
    ])
  })
})

describe('removeHolidayRange', () => {
  it('drops every holiday in [startDate, endDate]', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await upsertHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-24',
      endDate: '2026-12-31',
      name: 'Božićni praznici',
    })
    // Untouched holiday outside the delete range should survive.
    await upsertHoliday({ schoolYear: SY, date: '2027-05-01', name: 'Praznik rada' })

    const res = await removeHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-24',
      endDate: '2026-12-31',
    })
    expect(res).toEqual({ success: true })

    const remaining = await listHolidays(SY)
    expect(remaining.some((r) => r.date >= '2026-12-24' && r.date <= '2026-12-31')).toBe(false)
    expect(remaining.some((r) => r.date === '2027-05-01')).toBe(true)
  })

  it('rejects when endDate < startDate', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await removeHolidayRange({
      schoolYear: SY,
      startDate: '2026-12-31',
      endDate: '2026-12-24',
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/isti ili nakon početka/i)
  })

  it('refuses on an archived year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await removeHolidayRange({
      schoolYear: '2020/2021',
      startDate: '2020-12-24',
      endDate: '2020-12-31',
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
  })

  it('does not touch rows in other school years', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const OTHER_SY = '2028/2029'
    await db.schoolYear.upsert({
      where: { label: OTHER_SY },
      create: { label: OTHER_SY },
      update: {},
    })
    await db.schoolYearHoliday.create({
      data: {
        city: 'SPLIT',
        schoolYear: OTHER_SY,
        date: new Date(Date.UTC(2028, 11, 25)),
        name: 'Božić drugog godišta',
      },
    })

    await upsertHoliday({ schoolYear: SY, date: '2028-12-25', name: 'Božić' })

    const res = await removeHolidayRange({
      schoolYear: SY,
      startDate: '2028-12-20',
      endDate: '2028-12-31',
    })
    expect(res.success).toBe(true)

    expect(await db.schoolYearHoliday.count({ where: { schoolYear: SY, date: new Date(Date.UTC(2028, 11, 25)) } })).toBe(0)
    expect(await db.schoolYearHoliday.count({ where: { schoolYear: OTHER_SY } })).toBe(1)
  })
})

describe('removeHoliday', () => {
  it('deletes the row', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    // Use a date no earlier test touched — afterEach only clears
    // SchoolYearHoliday, not stray Attendance rows that block upsert.
    await upsertHoliday({ schoolYear: SY, date: '2027-05-01', name: 'Praznik rada' })
    const rows = await listHolidays(SY)
    const id = rows.find((r) => r.date === '2027-05-01')!.id

    const res = await removeHoliday({ id })
    expect(res).toEqual({ success: true })
    expect(await db.schoolYearHoliday.count({ where: { id } })).toBe(0)
  })

  it('refuses when the holiday belongs to an archived year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const row = await db.schoolYearHoliday.create({
      data: {
        city: 'SPLIT',
        schoolYear: '2020/2021',
        date: new Date(Date.UTC(2020, 11, 25)),
        name: 'Arhivirani Božić',
      },
    })

    const res = await removeHoliday({ id: row.id })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
    // Row still exists.
    expect(await db.schoolYearHoliday.count({ where: { id: row.id } })).toBe(1)
  })
})

describe('previewHolidaysFromApi', () => {
  beforeEach(async () => {
    // Earlier tests leave Attendance rows lying around (they only clear
    // SchoolYearHoliday). The preview action reports attendanceCount per
    // candidate date, so stray rows skew expectations here.
    await db.attendance.deleteMany({})
  })

  it('rejects callers without ADMIN role', async () => {
    mockSession({ id: 'nobody', role: 'STUDENT' })
    await expect(previewHolidaysFromApi(SY)).rejects.toThrow()
  })

  it('returns the API items annotated with existing + attendance flags', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    // Seed: one of the fixture dates is already a holiday + has attendance.
    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })
    await db.schoolYearHoliday.create({
      data: {
        city: 'SPLIT',
        schoolYear: SY,
        date: new Date('2026-12-25T00:00:00.000Z'),
        name: 'Božić',
      },
    })

    const res = await previewHolidaysFromApi(SY)
    expect(res.success).toBe(true)
    if (!res.success) return

    const bozic = res.items.find((i) => i.kind === 'single' && i.date === '2026-12-25')
    expect(bozic?.existing).toBe(true)
    expect(bozic?.attendanceCount).toBe(1)

    const novaGodina = res.items.find(
      (i) => i.kind === 'single' && i.date === '2027-01-01',
    )
    expect(novaGodina?.existing).toBe(false)
    expect(novaGodina?.attendanceCount).toBe(0)

    const zimski = res.items.find(
      (i) => i.kind === 'range' && i.startDate === '2026-12-24',
    )
    expect(zimski?.existing).toBe(false) // only one day in the 17-day range is set
    expect(zimski?.attendanceCount).toBe(1) // attendance on 2026-12-25 lives in range
    if (zimski?.kind === 'range') {
      expect(zimski.dayCount).toBe(17)
    }
  })

  it('rejects malformed school year input before hitting the network', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await previewHolidaysFromApi('bad-input')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/školska godina/i)
  })
})

describe('bulkImportHolidays', () => {
  beforeEach(async () => {
    await db.attendance.deleteMany({})
  })

  it('inserts single + range items in one call', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [
        { kind: 'single', date: '2026-12-25', name: 'Božić' },
        {
          kind: 'range',
          startDate: '2026-12-26',
          endDate: '2026-12-28',
          name: 'Zimski odmor',
        },
      ],
    })

    expect(res.success).toBe(true)
    if (res.success && !res.requiresConfirmation) {
      // 1 single + 3 days in range = 4
      expect(res.importedCount).toBe(4)
    }

    const rows = await listHolidays(SY)
    expect(rows.filter((r) => r.date === '2026-12-25')).toHaveLength(1)
    expect(rows.filter((r) => r.date >= '2026-12-26' && r.date <= '2026-12-28')).toHaveLength(
      3,
    )
  })

  it('re-running the same import is a no-op (unique (schoolYear, date) dedupes)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const items: Parameters<typeof bulkImportHolidays>[0]['items'] = [
      { kind: 'single', date: '2026-12-25', name: 'Božić' },
      { kind: 'range', startDate: '2027-01-01', endDate: '2027-01-03', name: 'Zimski' },
    ]

    await bulkImportHolidays({ schoolYear: SY, items })
    await bulkImportHolidays({ schoolYear: SY, items })

    const rows = await listHolidays(SY)
    // 1 (Božić) + 3 (Jan 1–3) = 4 distinct rows, unchanged after the rerun.
    expect(rows.filter((r) => r.date >= '2026-12-25' && r.date <= '2027-01-03')).toHaveLength(
      4,
    )
  })

  it('returns requiresConfirmation with the affected dates when attendance exists', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date('2027-01-01T00:00:00.000Z'),
    })

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [
        { kind: 'single', date: '2026-12-25', name: 'Božić' },
        { kind: 'single', date: '2027-01-01', name: 'Nova Godina' },
      ],
    })

    expect(res.success).toBe(true)
    if (res.success && res.requiresConfirmation) {
      expect(res.attendanceCount).toBe(2)
      expect(res.conflictDates.sort()).toEqual(['2026-12-25', '2027-01-01'])
    }

    // No write happened.
    expect(await db.schoolYearHoliday.count({ where: { schoolYear: SY } })).toBe(0)
    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(2)
  })

  it('with confirmDeleteAttendance, deletes attendance and writes every item', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await createAttendance(enrollment.id, admin.id, {
      sessionDate: new Date('2026-12-25T00:00:00.000Z'),
    })

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [{ kind: 'single', date: '2026-12-25', name: 'Božić' }],
      confirmDeleteAttendance: true,
    })

    expect(res.success).toBe(true)
    if (res.success && !res.requiresConfirmation) {
      expect(res.importedCount).toBe(1)
    }
    expect(await db.attendance.count({ where: { enrollmentId: enrollment.id } })).toBe(0)
    expect(await db.schoolYearHoliday.count({ where: { schoolYear: SY } })).toBe(1)
  })

  it('does not silently swallow attendance created in the TOCTOU window (atomic abort)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })
    const group = await createGroup({ courseId: course.id, schoolYear: SY })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })

    // Simulate an Attendance row that materialises AFTER the admin's preview, the
    // instant the import transaction opens — the classic time-of-check/time-of-use
    // window. The conflict check now lives INSIDE that transaction, so it must
    // observe the row, abort, and re-surface the confirmation — never silently
    // skip the day while counting it, nor write a partial import.
    type TxArgs = Parameters<typeof db.$transaction>
    const realTx = db.$transaction.bind(db) as (...a: TxArgs) => Promise<unknown>
    const spy = vi.spyOn(db, '$transaction')
    spy.mockImplementation(((...callArgs: TxArgs) => {
      if (typeof callArgs[0] === 'function') {
        return (async () => {
          await createAttendance(enrollment.id, admin.id, {
            sessionDate: new Date('2026-12-25T00:00:00.000Z'),
          })
          spy.mockRestore() // inject exactly once
          return realTx(...callArgs)
        })()
      }
      return realTx(...callArgs)
    }) as typeof db.$transaction)

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [
        { kind: 'single', date: '2026-12-24', name: 'Badnjak' },
        { kind: 'single', date: '2026-12-25', name: 'Božić' },
      ],
    })

    spy.mockRestore()

    // The late row surfaces as a confirmation instead of being swallowed.
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.requiresConfirmation).toBe(true)
      if (res.requiresConfirmation) {
        expect(res.conflictDates).toContain('2026-12-25')
      }
    }
    // Atomic: nothing written — not even the conflict-free 2026-12-24.
    expect(await db.schoolYearHoliday.count({ where: { schoolYear: SY } })).toBe(0)
  })

  it('refuses on an archived school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await bulkImportHolidays({
      schoolYear: '2020/2021',
      items: [{ kind: 'single', date: '2020-12-25', name: 'Božić' }],
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
  })

  it('rejects callers without ADMIN role', async () => {
    mockSession({ id: 'nobody', role: 'TEACHER' })
    await expect(
      bulkImportHolidays({
        schoolYear: SY,
        items: [{ kind: 'single', date: '2026-12-25', name: 'Božić' }],
      }),
    ).rejects.toThrow()
  })
})
