import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  createCourse,
  createEnrollmentWindow,
  createGroup,
  createLocation,
  createModule,
  createModuleSchedule,
} from './helpers/factory'

// Schema-shape guarantees introduced by the city (Split/Šibenik) separation:
// per-city composite uniques and the ScheduledGroup(locationId, city) →
// Location(id, city) FK backstop. No server actions involved — these pin the
// DB-level tenant invariants that every later scoping PR builds on.

const SY = '2026/2027'

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

afterEach(async () => {
  // Global wipe in FK-safe order (same rationale as the planner test's
  // cleanup): earlier-running files can leave enrollments, inquiries,
  // comments, or Restrict-FK materials pointing at groups/courses, which
  // would block the ScheduledGroup/Course wipe below.
  await db.attendance.deleteMany({})
  await db.moduleEnrollment.deleteMany({})
  await db.enrollment.deleteMany({})
  await db.studentComment.deleteMany({})
  await db.teacherAssignment.deleteMany({})
  await db.inquiry.deleteMany({})
  await db.material.deleteMany({})
  await db.courseEnrollmentWindow.deleteMany({})
  await db.moduleSchedule.deleteMany({})
  await db.schoolYearHoliday.deleteMany({})
  await db.scheduledGroup.deleteMany({})
  await db.courseModule.deleteMany({})
  await db.course.deleteMany({})
  await db.location.deleteMany({})
})

describe('city composite uniques', () => {
  it('lets each city open its own enrollment window for the same course + year', async () => {
    const course = await createCourse()
    await createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SPLIT' })
    await createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SIBENIK' })

    const windows = await db.courseEnrollmentWindow.findMany({
      where: { courseId: course.id, schoolYear: SY },
    })
    expect(windows.map((w) => w.city).sort()).toEqual(['SIBENIK', 'SPLIT'])
  })

  it('still rejects a duplicate window within one city', async () => {
    const course = await createCourse()
    await createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SIBENIK' })
    await expect(
      createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SIBENIK' }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('lets each city plan its own module dates for the shared curriculum', async () => {
    const course = await createCourse()
    const mod = await createModule(course.id)
    await createModuleSchedule(mod.id, {
      schoolYear: SY,
      city: 'SPLIT',
      startDate: new Date('2026-09-07T00:00:00.000Z'),
    })
    await createModuleSchedule(mod.id, {
      schoolYear: SY,
      city: 'SIBENIK',
      startDate: new Date('2026-11-02T00:00:00.000Z'),
    })

    const schedules = await db.moduleSchedule.findMany({
      where: { moduleId: mod.id, schoolYear: SY },
    })
    expect(schedules).toHaveLength(2)
    expect(new Set(schedules.map((s) => s.city))).toEqual(new Set(['SPLIT', 'SIBENIK']))
  })

  it('lets both cities mark the same holiday date independently', async () => {
    const date = new Date('2026-12-25T00:00:00.000Z')
    await db.schoolYearHoliday.create({
      data: { schoolYear: SY, city: 'SPLIT', date, name: 'Božić' },
    })
    await db.schoolYearHoliday.create({
      data: { schoolYear: SY, city: 'SIBENIK', date, name: 'Božić' },
    })
    await expect(
      db.schoolYearHoliday.create({
        data: { schoolYear: SY, city: 'SIBENIK', date, name: 'Božić' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})

describe('ScheduledGroup city ↔ Location city FK backstop', () => {
  it('rejects a group whose city differs from its venue city', async () => {
    const splitLocation = await createLocation({ city: 'SPLIT' })
    await expect(
      createGroup({ locationId: splitLocation.id, city: 'SIBENIK' }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })

  it('accepts a group whose city matches its venue city', async () => {
    const trokut = await createLocation({ city: 'SIBENIK' })
    const group = await createGroup({ locationId: trokut.id, city: 'SIBENIK' })
    expect(group.city).toBe('SIBENIK')
  })
})
