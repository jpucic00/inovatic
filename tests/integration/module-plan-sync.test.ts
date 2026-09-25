import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse, createModule, createModuleSchedule } from './helpers/factory'
import { wipePlanningTables } from './helpers/cleanup'
import { computeWeekdaySummary } from '@/lib/group-end-dates'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { rederiveModuleWindows } from '@/lib/module-plan-sync'
import { toDateKey } from '@/lib/session-dates'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { upsertHoliday, upsertHolidayRange, removeHoliday, removeHolidayRange, bulkImportHolidays } =
  await import('@/actions/admin/holidays')
const { completeSchoolYearPlan } = await import('@/actions/admin/school-year-planner')

const SY = '2026/2027'
const UNPLANNED_SY = '2027/2028'
const ARCHIVED_SY = '2020/2021'
const KICKOFF = '2026-09-01' // Tue — Monday is the slowest weekday of module 1
const MONDAY_IN_MODULE_1 = '2026-10-12'

beforeAll(async () => {
  for (const label of [SY, UNPLANNED_SY, ARCHIVED_SY]) {
    await db.schoolYear.upsert({ where: { label }, create: { label }, update: {} })
  }
})

// The re-derivation walks every standard course of the (city, year), so this
// file wants the same empty slate the planner tests use.
beforeEach(async () => {
  await wipePlanningTables()
})

afterAll(async () => {
  await wipePlanningTables()
})

async function seedStandardCourses(count: number) {
  const courses = []
  for (let c = 0; c < count; c++) {
    const course = await createCourse({ kind: 'STANDARD' })
    for (let i = 0; i < 4; i++) await createModule(course.id, { sortOrder: i, title: `Modul ${i + 1}` })
    courses.push(course)
  }
  return courses
}

async function planAs(city: City, kickoff = KICKOFF) {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  expect(await completeSchoolYearPlan({ schoolYear: SY, startDate: kickoff })).toEqual({
    success: true,
  })
  return admin
}

/** Stored windows per course, modules in sortOrder, as [start, end] keys. */
async function storedWindows(city: City, schoolYear = SY) {
  const courses = await db.course.findMany({
    where: { kind: 'STANDARD' },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      modules: {
        orderBy: { sortOrder: 'asc' },
        select: { schedules: { where: { schoolYear, city }, select: { startDate: true, endDate: true } } },
      },
    },
  })
  return courses.map((c) => ({
    courseId: c.id,
    windows: c.modules.map((m) => ({
      startDate: m.schedules[0]?.startDate ?? null,
      endDate: m.schedules[0]?.endDate ?? null,
    })),
  }))
}

function asKeys(rows: Awaited<ReturnType<typeof storedWindows>>) {
  return rows.map((r) =>
    r.windows.map((w) => [w.startDate && toDateKey(w.startDate), w.endDate && toDateKey(w.endDate)]),
  )
}

/** The Kalendar's per-weekday count, computed exactly as the page does: stored windows + holidays. */
async function sessionCounts(
  city: City,
  windows?: Awaited<ReturnType<typeof storedWindows>>,
): Promise<number[]> {
  const rows = windows ?? (await storedWindows(city))
  const summary = computeWeekdaySummary({
    courses: rows.map((r) => ({
      courseId: r.courseId,
      courseTitle: r.courseId,
      level: null,
      moduleWindows: r.windows,
    })),
    holidayDates: await loadHolidayDateKeys(SY, city),
  })
  return summary.flatMap((w) => w.courses.map((c) => c.computedSessions))
}

/** Backends of this database currently waiting on a lock (advisory or row). */
async function waitingLockCount(): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE NOT l.granted AND a.datname = current_database()`
  return row.n
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('holiday mutations re-derive module windows', () => {
  it('adding a holiday keeps every weekday on 28 — the stale windows would have read 27', async () => {
    await seedStandardCourses(2)
    await planAs('SPLIT')
    const before = await storedWindows('SPLIT')

    expect(await upsertHoliday({ schoolYear: SY, date: MONDAY_IN_MODULE_1, name: 'Test' })).toEqual({
      success: true,
      requiresConfirmation: false,
    })

    // The incident: the windows the year was planned with, read against the
    // new holiday, give Monday 27.
    expect(Math.min(...(await sessionCounts('SPLIT', before)))).toBe(27)
    // What the Kalendar actually reads now.
    expect(new Set(await sessionCounts('SPLIT'))).toEqual(new Set([28]))
    const m1 = (await storedWindows('SPLIT'))[0].windows[0]
    expect(toDateKey(m1.startDate!)).toBe(KICKOFF)
    expect(toDateKey(m1.endDate!)).toBe('2026-10-26')
  })

  it('module 2–4 start dates follow the holiday (they drive when a module falls due)', async () => {
    await seedStandardCourses(1)
    await planAs('SPLIT')
    const [before] = await storedWindows('SPLIT')

    await upsertHoliday({ schoolYear: SY, date: MONDAY_IN_MODULE_1, name: 'Test' })

    const [after] = await storedWindows('SPLIT')
    for (const i of [1, 2, 3]) {
      expect(after.windows[i].startDate!.getTime()).toBeGreaterThan(
        before.windows[i].startDate!.getTime(),
      )
    }
  })

  it('leaves a standard course that is not exactly 4 modules untouched, and still moves the rest', async () => {
    await seedStandardCourses(1)
    await planAs('SPLIT')
    // Added after planning with windows of its own (the planner would refuse
    // a 3-module course, so it can only arrive like this).
    const odd = await createCourse({ kind: 'STANDARD' })
    const oddWindows = [
      ['2026-09-07', '2026-11-02'],
      ['2026-11-09', '2027-01-25'],
      ['2027-02-01', '2027-04-26'],
    ]
    for (const [i, [start, end]] of oddWindows.entries()) {
      const m = await createModule(odd.id, { sortOrder: i, title: `Modul ${i + 1}` })
      await createModuleSchedule(m.id, {
        schoolYear: SY,
        city: 'SPLIT',
        startDate: new Date(`${start}T00:00:00Z`),
        endDate: new Date(`${end}T00:00:00Z`),
      })
    }
    const before = await storedWindows('SPLIT')

    await upsertHoliday({ schoolYear: SY, date: MONDAY_IN_MODULE_1, name: 'Test' })

    const after = await storedWindows('SPLIT')
    const oddAfter = after.find((r) => r.courseId === odd.id)!
    expect(asKeys([oddAfter])).toEqual([oddWindows])
    const planned = (rows: typeof after) => asKeys(rows.filter((r) => r.courseId !== odd.id))
    expect(planned(after)).not.toEqual(planned(before))
  })

  it('deleting the holiday moves the windows back', async () => {
    await seedStandardCourses(2)
    await planAs('SPLIT')
    const original = asKeys(await storedWindows('SPLIT'))

    await upsertHoliday({ schoolYear: SY, date: MONDAY_IN_MODULE_1, name: 'Test' })
    expect(asKeys(await storedWindows('SPLIT'))).not.toEqual(original)

    const row = await db.schoolYearHoliday.findFirstOrThrow({ where: { schoolYear: SY, city: 'SPLIT' } })
    expect(await removeHoliday({ id: row.id })).toEqual({ success: true })
    expect(asKeys(await storedWindows('SPLIT'))).toEqual(original)
  })

  it('a range add and a range delete re-derive too', async () => {
    await seedStandardCourses(1)
    await planAs('SPLIT')
    const original = asKeys(await storedWindows('SPLIT'))

    await upsertHolidayRange({ schoolYear: SY, startDate: '2026-12-21', endDate: '2027-01-06', name: 'Zima' })
    expect(asKeys(await storedWindows('SPLIT'))).not.toEqual(original)
    expect(new Set(await sessionCounts('SPLIT'))).toEqual(new Set([28]))

    await removeHolidayRange({ schoolYear: SY, startDate: '2026-12-21', endDate: '2027-01-06' })
    expect(asKeys(await storedWindows('SPLIT'))).toEqual(original)
  })

  it('a bulk import re-derives in the same transaction', async () => {
    await seedStandardCourses(1)
    await planAs('SPLIT')
    const original = asKeys(await storedWindows('SPLIT'))

    const res = await bulkImportHolidays({
      schoolYear: SY,
      items: [
        { kind: 'single', date: MONDAY_IN_MODULE_1, name: 'Blagdan' },
        { kind: 'range', startDate: '2026-12-21', endDate: '2027-01-06', name: 'Zimski praznici' },
      ],
    })
    expect(res).toMatchObject({ success: true, requiresConfirmation: false })
    expect(asKeys(await storedWindows('SPLIT'))).not.toEqual(original)
    expect(new Set(await sessionCounts('SPLIT'))).toEqual(new Set([28]))
  })

  it('two concurrent holiday edits of one (city, year) both land in the windows', async () => {
    await seedStandardCourses(1)
    await planAs('SPLIT')

    // T1 adds one Monday and re-derives, then stays open. Without the plan lock
    // T2 reads the holidays before T1 commits (seeing only its own), queues
    // behind T1's window rows and overwrites them with a plan missing T1's day.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let derived!: () => void
    const firstDerived = new Promise<void>((resolve) => {
      derived = resolve
    })
    const first = db.$transaction(
      async (tx) => {
        await tx.schoolYearHoliday.create({
          data: { schoolYear: SY, city: 'SPLIT', date: new Date(`${MONDAY_IN_MODULE_1}T00:00:00Z`) },
        })
        await rederiveModuleWindows(tx, { city: 'SPLIT', schoolYear: SY })
        derived()
        await gate
      },
      { timeout: 20_000 },
    )
    // Only start T2 once T1 holds the lock and its window rows, and only let
    // T1 commit once T2 is parked on a lock — otherwise nothing overlaps.
    await firstDerived
    const second = upsertHoliday({ schoolYear: SY, date: '2026-10-19', name: 'Drugi' })
    await waitFor(async () => (await waitingLockCount()) > 0)
    release()
    await first
    expect(await second).toEqual({ success: true, requiresConfirmation: false })

    const concurrent = asKeys(await storedWindows('SPLIT'))
    await db.$transaction((tx) => rederiveModuleWindows(tx, { city: 'SPLIT', schoolYear: SY }))
    expect(concurrent).toEqual(asKeys(await storedWindows('SPLIT')))
    expect(new Set(await sessionCounts('SPLIT'))).toEqual(new Set([28]))
  })

  it('a year without a plan is left alone — no schedule rows appear', async () => {
    await seedStandardCourses(1)
    await planAs('SPLIT')

    await upsertHoliday({ schoolYear: UNPLANNED_SY, date: '2027-10-11', name: 'Test' })

    expect(await db.moduleSchedule.count({ where: { schoolYear: UNPLANNED_SY } })).toBe(0)
  })

  it('an archived year is never rewritten', async () => {
    const [course] = await seedStandardCourses(1)
    const modules = await db.courseModule.findMany({
      where: { courseId: course.id },
      orderBy: { sortOrder: 'asc' },
    })
    // Hand-made archive windows that the planner would NOT produce.
    for (const [i, m] of modules.entries()) {
      await createModuleSchedule(m.id, {
        schoolYear: ARCHIVED_SY,
        city: 'SPLIT',
        startDate: new Date(Date.UTC(2020, 8 + i * 2, 1)),
        endDate: new Date(Date.UTC(2020, 9 + i * 2, 1)),
      })
    }
    await db.schoolYearHoliday.create({
      data: { schoolYear: ARCHIVED_SY, city: 'SPLIT', date: new Date(Date.UTC(2020, 9, 12)) },
    })
    const before = asKeys(await storedWindows('SPLIT', ARCHIVED_SY))

    await db.$transaction((tx) => rederiveModuleWindows(tx, { city: 'SPLIT', schoolYear: ARCHIVED_SY }))

    expect(asKeys(await storedWindows('SPLIT', ARCHIVED_SY))).toEqual(before)
  })
})
