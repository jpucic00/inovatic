import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import {
  createEnrollmentWindow,
  createModule,
  createModuleSchedule,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

// Schema-shape guarantees introduced by the city (Split/Šibenik) separation:
// per-city composite uniques and the ScheduledGroup(locationId, city) →
// Location(id, city) FK backstop. No server actions involved — these pin the
// DB-level tenant invariants that every later scoping PR builds on.

const SY = '2026/2027'
const XMAS = new Date('2026-12-25T00:00:00.000Z')

// These cases pin DB constraints, not global reads — so the teardown names the
// ids this file created instead of emptying the tables. A global wipe here
// would delete a neighbouring file's fixtures too, which is how an unrelated
// file ends up failing on an FK RESTRICT it never touched.
const fx = fixtureScope()

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
  // Other files plan holidays on 2026-12-25 too, and the per-city unique test
  // below needs the slot empty — clear just that one date, on the way in and
  // between tests.
  await db.schoolYearHoliday.deleteMany({ where: { schoolYear: SY, date: XMAS } })
})

afterEach(async () => {
  await fx.cleanup()
  await db.schoolYearHoliday.deleteMany({ where: { schoolYear: SY, date: XMAS } })
})

describe('city composite uniques', () => {
  it('lets each city open its own enrollment window for the same course + year', async () => {
    const course = await fx.course()
    await createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SPLIT' })
    await createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SIBENIK' })

    const windows = await db.courseEnrollmentWindow.findMany({
      where: { courseId: course.id, schoolYear: SY },
    })
    expect(windows.map((w) => w.city).sort()).toEqual(['SIBENIK', 'SPLIT'])
  })

  it('still rejects a duplicate window within one city', async () => {
    const course = await fx.course()
    await createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SIBENIK' })
    await expect(
      createEnrollmentWindow(course.id, { schoolYear: SY, city: 'SIBENIK' }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('lets each city plan its own module dates for the shared curriculum', async () => {
    const course = await fx.course()
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
    const date = XMAS
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
    // Course created up front rather than left to the factory: the group insert
    // is meant to fail, and a course minted inside that call would never reach
    // the tracker.
    const course = await fx.course()
    const splitLocation = await fx.location({ city: 'SPLIT' })
    await expect(
      fx.group({ courseId: course.id, locationId: splitLocation.id, city: 'SIBENIK' }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })

  it('accepts a group whose city matches its venue city', async () => {
    const trokut = await fx.location({ city: 'SIBENIK' })
    const group = await fx.group({ locationId: trokut.id, city: 'SIBENIK' })
    expect(group.city).toBe('SIBENIK')
  })
})
