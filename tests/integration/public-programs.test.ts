/**
 * `getActivePrograms` — what the public site is allowed to offer (Flux ql3p3ps).
 *
 * The enrollment-window gate and the radionica start-date cutoff have their own
 * files (`public-enrollment-window`, `radionica-signup-cutoff`), and the capacity
 * arithmetic is unit-tested. What had no coverage is the loader's own assembly:
 * the `return null` that hides a standard group with no upcoming module, the
 * `currentModuleName` the termin dropdown displays, and the fact that holidays
 * are resolved per the GROUP'S school year rather than today's.
 *
 * Every fixture is dated relative to now, because the loader reads the real
 * clock — a hardcoded window would pass until it silently expired.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import type { City } from '@prisma/client'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'
import {
  createEnrollment,
  createInquiry,
  createModule,
  createStudent,
  relativeDateKey,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getActivePrograms } = await import('@/actions/public/programs')

const YEAR = computeSchoolYear()
const NEXT_YEAR = getNextSchoolYear(YEAR)
// The holiday cases need years nobody else in this shared-DB tier plans in:
// a SchoolYearHoliday row is (schoolYear, city, date) and would otherwise shift
// a neighbouring file's arcs.
const HOLIDAY_YEAR_A = '2027/2028'
const HOLIDAY_YEAR_B = '2028/2029'

const WEEKDAYS = [
  'Nedjelja',
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
] as const

const scope = fixtureScope()
const holidayYears: string[] = []

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)
const utcToday = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function openWindow(courseId: string, schoolYear: string, city: City = 'SPLIT') {
  await db.courseEnrollmentWindow.create({
    data: {
      courseId,
      schoolYear,
      city,
      enrollmentStart: daysFromNow(-1),
      enrollmentEnd: daysFromNow(30),
    },
  })
}

/**
 * `Modul 1` of `courseId` with one dated window per school year.
 *
 * The arc starts at the lowest `sortOrder` and stops at the first module with no
 * schedule for the group's own year, so two years of dates belong on the SAME
 * module (as `ModuleSchedule`'s (moduleId, schoolYear, city) key intends) — hang
 * them off two modules instead and every group's arc breaks at module 1.
 */
async function scheduleModule(
  courseId: string,
  years: { schoolYear: string; startDate: Date; endDate: Date }[],
) {
  const mod = await createModule(courseId, { title: 'Modul 1', sortOrder: 0 })
  const schedules = await Promise.all(
    years.map((y) =>
      db.moduleSchedule.create({
        data: {
          moduleId: mod.id,
          schoolYear: y.schoolYear,
          city: 'SPLIT',
          startDate: y.startDate,
          endDate: y.endDate,
        },
      }),
    ),
  )
  return { mod, schedule: schedules[0], schedules }
}

/** The group's row in the feed, or undefined when the loader dropped it. */
async function feedGroup(courseId: string, groupId: string) {
  const programs = await getActivePrograms('SPLIT')
  return programs.find((p) => p.id === courseId)?.groups.find((g) => g.id === groupId)
}

beforeAll(async () => {
  delete process.env.RESEND_API_KEY
})

afterAll(async () => {
  await db.schoolYearHoliday.deleteMany({ where: { schoolYear: { in: holidayYears } } })
  await scope.cleanup()
})

describe('getActivePrograms — the upcoming-module gate', () => {
  it('offers a standard group whose next module has not started, naming that module', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await openWindow(course.id, YEAR)
    await scheduleModule(course.id, [
      { schoolYear: YEAR, startDate: daysFromNow(14), endDate: daysFromNow(60) },
    ])
    const group = await scope.group({ courseId: course.id, schoolYear: YEAR, city: 'SPLIT' })

    const row = await feedGroup(course.id, group.id)

    expect(row).toBeDefined()
    // This is the string the termin dropdown shows the parent.
    expect(row?.currentModuleName).toBe('Modul 1')
  })

  it('drops a group whose whole arc is behind it, and keeps its course’s other termin', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await openWindow(course.id, YEAR)
    await openWindow(course.id, NEXT_YEAR)
    // One module, two dated years: this year's seven weekly sessions started
    // four months ago and are done, next year's have not begun.
    await scheduleModule(course.id, [
      { schoolYear: YEAR, startDate: daysFromNow(-120), endDate: daysFromNow(-70) },
      { schoolYear: NEXT_YEAR, startDate: daysFromNow(14), endDate: daysFromNow(60) },
    ])
    const graduated = await scope.group({ courseId: course.id, schoolYear: YEAR, city: 'SPLIT' })
    const upcoming = await scope.group({
      courseId: course.id,
      schoolYear: NEXT_YEAR,
      city: 'SPLIT',
    })

    const programs = await getActivePrograms('SPLIT')
    const program = programs.find((p) => p.id === course.id)

    // The program stays on the site — it is the finished termin that goes.
    expect(program).toBeDefined()
    expect(program?.groups.map((g) => g.id)).toEqual([upcoming.id])
    expect(program?.groups.map((g) => g.id)).not.toContain(graduated.id)
  })

  it('drops a group whose only future module belongs to another school year', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await openWindow(course.id, YEAR)
    // Future, but scheduled under NEXT_YEAR while the group runs in YEAR.
    await scheduleModule(course.id, [
      { schoolYear: NEXT_YEAR, startDate: daysFromNow(14), endDate: daysFromNow(60) },
    ])
    const group = await scope.group({ courseId: course.id, schoolYear: YEAR, city: 'SPLIT' })

    expect(await feedGroup(course.id, group.id)).toBeUndefined()
  })

  it('drops a standard group with no module dates at all, while a radionica needs none', async () => {
    const standard = await scope.course({ kind: 'STANDARD' })
    await openWindow(standard.id, YEAR)
    await createModule(standard.id, { title: 'Modul 1', sortOrder: 0 }) // no schedule
    const standardGroup = await scope.group({
      courseId: standard.id,
      schoolYear: YEAR,
      city: 'SPLIT',
    })

    const radionica = await scope.course({ kind: 'RADIONICA' })
    await openWindow(radionica.id, YEAR)
    const radionicaGroup = await scope.group({
      courseId: radionica.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      dateStart: relativeDateKey(14),
      dateEnd: relativeDateKey(18),
    })

    // The asymmetry is deliberate: a standard termin without a dated module has
    // nothing to enrol INTO, while a workshop is one fixed date range.
    expect(await feedGroup(standard.id, standardGroup.id)).toBeUndefined()
    expect(await feedGroup(radionica.id, radionicaGroup.id)).toBeDefined()
  })
})

describe('getActivePrograms — spots reaching the public feed', () => {
  it('counts enrollments on the upcoming module plus unanswered upiti', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await openWindow(course.id, YEAR)
    const { schedule } = await scheduleModule(course.id, [
      { schoolYear: YEAR, startDate: daysFromNow(14), endDate: daysFromNow(60) },
    ])
    const group = await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      maxStudents: 5,
    })

    for (const _ of [0, 1]) {
      const student = await createStudent()
      const enrollment = await createEnrollment(student.id, group.id, { schoolYear: YEAR })
      await db.moduleEnrollment.create({
        data: { enrollmentId: enrollment.id, moduleScheduleId: schedule.id },
      })
    }
    await createInquiry({ scheduledGroupId: group.id, city: 'SPLIT', schoolYear: YEAR })
    // A declined upit is not waiting on an answer, so it holds nothing.
    await createInquiry({
      scheduledGroupId: group.id,
      city: 'SPLIT',
      schoolYear: YEAR,
      status: 'DECLINED',
    })

    const row = await feedGroup(course.id, group.id)

    expect(row?.availableSpots).toBe(2)
    expect(row?.isFull).toBe(false)
  })

  it('reports a saturated termin as full rather than hiding it', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await openWindow(course.id, YEAR)
    const { schedule } = await scheduleModule(course.id, [
      { schoolYear: YEAR, startDate: daysFromNow(14), endDate: daysFromNow(60) },
    ])
    const group = await scope.group({
      courseId: course.id,
      schoolYear: YEAR,
      city: 'SPLIT',
      maxStudents: 1,
    })
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: YEAR })
    await db.moduleEnrollment.create({
      data: { enrollmentId: enrollment.id, moduleScheduleId: schedule.id },
    })

    const row = await feedGroup(course.id, group.id)

    // Still listed — the form renders it disabled, which is how a parent learns
    // the termin exists and is taken instead of that it never existed.
    expect(row).toBeDefined()
    expect(row?.availableSpots).toBe(0)
    expect(row?.isFull).toBe(true)
  })
})

describe('getActivePrograms — holidays follow the group’s own school year', () => {
  it('a holiday in one year moves only that year’s group off today', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    await openWindow(course.id, HOLIDAY_YEAR_A)
    await openWindow(course.id, HOLIDAY_YEAR_B)
    const today = utcToday()
    const weekday = WEEKDAYS[today.getUTCDay()]

    // Identical setup in two school years: the first session of each module
    // lands on today, which means "already in progress" and therefore nothing
    // left to enrol into.
    await scheduleModule(course.id, [
      { schoolYear: HOLIDAY_YEAR_A, startDate: today, endDate: daysFromNow(60) },
      { schoolYear: HOLIDAY_YEAR_B, startDate: today, endDate: daysFromNow(60) },
    ])
    // SchoolYearHoliday.schoolYear is FK'd to the year registry, so the year has
    // to exist before its holidays do.
    for (const year of [HOLIDAY_YEAR_A, HOLIDAY_YEAR_B]) {
      await db.schoolYear.upsert({ where: { label: year }, create: { label: year }, update: {} })
    }
    holidayYears.push(HOLIDAY_YEAR_A)
    await db.schoolYearHoliday.create({
      data: { schoolYear: HOLIDAY_YEAR_A, city: 'SPLIT', date: today },
    })

    const groupA = await scope.group({
      courseId: course.id,
      schoolYear: HOLIDAY_YEAR_A,
      city: 'SPLIT',
      dayOfWeek: weekday,
    })
    const groupB = await scope.group({
      courseId: course.id,
      schoolYear: HOLIDAY_YEAR_B,
      city: 'SPLIT',
      dayOfWeek: weekday,
    })

    // A's first session was a holiday, so it slid a week out and the termin is
    // open again; B never saw that holiday and started today.
    expect(await feedGroup(course.id, groupA.id)).toBeDefined()
    expect(await feedGroup(course.id, groupB.id)).toBeUndefined()

    // Now move the holiday to the other year. Nothing else changes — same
    // course, same module, same two groups, same weekday — so if the outcomes
    // did not trade places the holiday set would not be following the group's
    // own year, which is the whole claim.
    holidayYears.push(HOLIDAY_YEAR_B)
    await db.schoolYearHoliday.deleteMany({ where: { schoolYear: HOLIDAY_YEAR_A } })
    await db.schoolYearHoliday.create({
      data: { schoolYear: HOLIDAY_YEAR_B, city: 'SPLIT', date: today },
    })

    expect(await feedGroup(course.id, groupA.id)).toBeUndefined()
    expect(await feedGroup(course.id, groupB.id)).toBeDefined()
  })
})
