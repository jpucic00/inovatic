import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createModule,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { completeSchoolYearPlan } = await import(
  '@/actions/admin/school-year-planner'
)

// Current year per CLAUDE.md (today = 2026-05-25 → 2026/2027 is the active
// school year for this repo).
const SY = '2026/2027'
const ARCHIVED_SY = '2020/2021'
const SY_START = '2026-09-01' // Tue

beforeAll(async () => {
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
  await db.schoolYear.upsert({
    where: { label: ARCHIVED_SY },
    create: { label: ARCHIVED_SY },
    update: {},
  })
})

afterEach(async () => {
  // Each test seeds its own standard courses; if we left them lying around
  // the planner's "standard programs" count + drift-detection guards would
  // see polluted state across tests. Delete in FK-safe order: rows that
  // reference ScheduledGroup (Attendance → ModuleEnrollment → Enrollment →
  // TeacherAssignment) must go before ScheduledGroup itself. Without this,
  // any prior test file that left enrollments behind would FK-block the
  // ScheduledGroup wipe.
  await db.attendance.deleteMany({})
  await db.moduleEnrollment.deleteMany({})
  await db.enrollment.deleteMany({})
  await db.teacherAssignment.deleteMany({})
  await db.moduleSchedule.deleteMany({})
  await db.scheduledGroup.deleteMany({})
  await db.courseModule.deleteMany({})
  await db.course.deleteMany({})
  await db.location.deleteMany({})
  await db.schoolYearHoliday.deleteMany({})
})

async function seedFourStandardCourses() {
  // Planner targets every standard program regardless of whether groups
  // exist — admin's workflow is "plan first, create groups later". Groups
  // are not part of the calendar/planner pipeline.
  const courses = await Promise.all(
    [0, 1, 2, 3].map(() => createCourse({ isCustom: false })),
  )
  for (const c of courses) {
    for (let i = 0; i < 4; i++) {
      await createModule(c.id, { sortOrder: i, title: `Modul ${i + 1}` })
    }
  }
  return courses
}

describe('completeSchoolYearPlan', () => {
  it('rejects callers without ADMIN role', async () => {
    mockSession({ id: 'nobody', role: 'STUDENT' })
    await expect(
      completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START }),
    ).rejects.toThrow()
  })

  it('refuses malformed input', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await completeSchoolYearPlan({
      schoolYear: 'not-a-year',
      startDate: SY_START,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Nevaljani/i)
  })

  it('refuses on an archived school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    // No groups needed — archived check happens first.
    const res = await completeSchoolYearPlan({
      schoolYear: ARCHIVED_SY,
      startDate: '2020-09-01',
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
  })

  it('plans a fresh year with zero ScheduledGroups (group existence is irrelevant)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await seedFourStandardCourses() // no groups created
    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(res).toEqual({ success: true })
    // 16 rows landed (4 courses × 4 modules), independent of any group.
    expect(await db.moduleSchedule.count({ where: { schoolYear: SY } })).toBe(16)
  })

  it('writes 16 ModuleSchedule rows with identical dates per moduleIndex (happy path)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const courses = await seedFourStandardCourses()

    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(res).toEqual({ success: true })

    const rows = await db.moduleSchedule.findMany({
      where: { schoolYear: SY },
      include: { module: { select: { sortOrder: true, courseId: true } } },
    })
    // 4 standard courses × 4 modules.
    expect(rows.length).toBe(16)

    // Group by sortOrder and confirm all 4 courses share the same (start, end).
    const bySortOrder = new Map<number, Set<string>>()
    for (const r of rows) {
      const key = `${r.startDate?.toISOString()}|${r.endDate?.toISOString()}`
      const set = bySortOrder.get(r.module.sortOrder) ?? new Set<string>()
      set.add(key)
      bySortOrder.set(r.module.sortOrder, set)
    }
    for (const [, set] of bySortOrder) {
      expect(set.size).toBe(1) // every course shares the same window for that module
    }
    // 4 distinct (start, end) pairs across the 4 modules.
    const allPairs = new Set<string>()
    for (const r of rows) {
      allPairs.add(`${r.startDate?.toISOString()}|${r.endDate?.toISOString()}`)
    }
    expect(allPairs.size).toBe(4)

    // Module 1 starts on the user-entered date.
    const m1 = rows.find((r) => r.module.sortOrder === 0)
    expect(m1?.startDate?.toISOString().slice(0, 10)).toBe(SY_START)
    // (Spot-check expected end for Mon-only group: 7th Monday from Sept 1, 2026
    // is Oct 19, 2026.)
    expect(m1?.endDate?.toISOString().slice(0, 10)).toBe('2026-10-19')
    // Untouched data should still be reachable on the underlying courses.
    expect(courses).toHaveLength(4)
  })

  it('refuses a re-run after dates already exist (planner is one-shot)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await seedFourStandardCourses()

    const first = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(first.success).toBe(true)

    const second = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(second.success).toBe(false)
    if (!second.success) expect(second.error).toMatch(/Datumi modula već postoje/i)

    // Still 16 rows, no extras from the rejected re-run.
    const count = await db.moduleSchedule.count({ where: { schoolYear: SY } })
    expect(count).toBe(16)
  })

  it('honors holidays when computing module windows', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await seedFourStandardCourses()
    // Mark Mon Oct 19 as a holiday → Mon's 7th from Sept 1 shifts to Oct 26,
    // dragging Module 1 endDate one week later.
    await db.schoolYearHoliday.create({
      data: {
        city: 'SPLIT',
        schoolYear: SY,
        date: new Date(Date.UTC(2026, 9, 19)), // Oct 19
        name: 'Test',
      },
    })

    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(res.success).toBe(true)

    const m1 = await db.moduleSchedule.findFirst({
      where: { schoolYear: SY, module: { sortOrder: 0 } },
    })
    expect(m1?.endDate?.toISOString().slice(0, 10)).toBe('2026-10-26')
  })

  it('refuses when a standard course does not have exactly 4 modules', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await seedFourStandardCourses()
    // Inject a drifted course with only 3 modules. Groups irrelevant — every
    // standard course is in scope.
    const drift = await createCourse({ isCustom: false, title: 'Drift program' })
    for (let i = 0; i < 3; i++) {
      await createModule(drift.id, { sortOrder: i, title: `Modul ${i + 1}` })
    }

    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/Drift program/)
      expect(res.error).toMatch(/4 modula/)
    }
    // Nothing was written.
    expect(await db.moduleSchedule.count({ where: { schoolYear: SY } })).toBe(0)
  })

  it('handles 1-indexed sortOrder (seed convention) without going out of bounds', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    // Seed uses sortOrder 1..4 (see prisma/seed.ts). The action must order by
    // sortOrder ASC and use position-in-list, NOT raw sortOrder, to index
    // into plan.modules (length 4, 0..3).
    const course = await createCourse({ isCustom: false, title: 'Seed-style SLR' })
    const modules: Array<{ id: string }> = []
    for (let i = 1; i <= 4; i++) {
      modules.push(await createModule(course.id, { sortOrder: i, title: `Modul ${i}` }))
    }

    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(res).toEqual({ success: true })

    // 4 rows landed with non-null dates in ascending order — position 0
    // → Module 1 startDate = SY_START.
    const rows = await db.moduleSchedule.findMany({
      where: { schoolYear: SY, moduleId: { in: modules.map((m) => m.id) } },
      include: { module: { select: { sortOrder: true } } },
      orderBy: { module: { sortOrder: 'asc' } },
    })
    expect(rows).toHaveLength(4)
    expect(rows[0].startDate?.toISOString().slice(0, 10)).toBe(SY_START)
    for (const r of rows) {
      expect(r.startDate).not.toBeNull()
      expect(r.endDate).not.toBeNull()
    }
    // Subsequent modules start the day after the previous module ends.
    for (let i = 1; i < rows.length; i++) {
      const prevEnd = rows[i - 1].endDate!
      const expectedStart = new Date(prevEnd.getTime() + 86_400_000)
      expect(rows[i].startDate?.toISOString()).toBe(expectedStart.toISOString())
    }
  })

  it('does not touch custom radionice', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    await seedFourStandardCourses()
    const radionica = await createCourse({ isCustom: true, title: 'Radionica' })
    const radionicaModule = await createModule(radionica.id, {
      sortOrder: 0,
      title: 'Sastavi auto',
    })
    // Seed a pre-existing ModuleSchedule on the radionica — planner must
    // leave it alone.
    await db.moduleSchedule.create({
      data: {
        city: 'SPLIT',
        moduleId: radionicaModule.id,
        schoolYear: SY,
        startDate: new Date(Date.UTC(2026, 10, 15)),
        endDate: new Date(Date.UTC(2026, 10, 22)),
      },
    })

    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: SY_START })
    expect(res.success).toBe(true)

    const radionicaAfter = await db.moduleSchedule.findFirst({
      where: { moduleId: radionicaModule.id, schoolYear: SY },
    })
    expect(radionicaAfter?.startDate?.toISOString().slice(0, 10)).toBe('2026-11-15')
    expect(radionicaAfter?.endDate?.toISOString().slice(0, 10)).toBe('2026-11-22')
    // 16 standard + 1 radionica = 17 rows total for the year.
    expect(await db.moduleSchedule.count({ where: { schoolYear: SY } })).toBe(17)
  })
})
