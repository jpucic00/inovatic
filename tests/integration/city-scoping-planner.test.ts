import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createEnrollmentWindow,
  createGroup,
  createModule,
  createModuleSchedule,
  createStudent,
  createTeacher,
  createAttendance,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

const { upsertHolidayRange, removeHoliday, removeHolidayRange, listHolidays } =
  await import('@/actions/admin/holidays')
const { completeSchoolYearPlan } = await import('@/actions/admin/school-year-planner')
const { closeModuleSchedule, addModuleEnrollment } = await import(
  '@/actions/admin/module-enrollment'
)
const { upsertModuleSchedule } = await import('@/actions/admin/module')
const { upsertEnrollmentWindow } = await import('@/actions/admin/enrollment-window')

const SY = '2026/2027'
const ARCHIVED_SY = '2020/2021'
const XMAS = '2026-12-25'

async function sibenikAdminSession() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

async function splitAdminSession() {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  return admin
}

/** FK-safe wipe of everything the planner/holiday tests touch (users stay). */
async function wipePlannerTables() {
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
}

beforeAll(async () => {
  for (const label of [SY, ARCHIVED_SY]) {
    await db.schoolYear.upsert({ where: { label }, create: { label }, update: {} })
  }
})

beforeEach(async () => {
  await wipePlannerTables()
})

/** A group + enrolled student + one attendance row on `dateKey`, all in `city`. */
async function seedAttendanceInCity(city: 'SPLIT' | 'SIBENIK', dateKey: string) {
  const group = await createGroup({ city, schoolYear: SY })
  const student = await createStudent({ city })
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
  const recorder = await createTeacher({ city })
  const attendance = await createAttendance(enrollment.id, recorder.id, {
    sessionDate: new Date(`${dateKey}T00:00:00.000Z`),
  })
  return { group, enrollment, attendance }
}

describe('holiday attendance cascade — city isolation (irreversible-delete guard)', () => {
  it('a Šibenik holiday with confirmed deletion never touches Split attendance', async () => {
    const split = await seedAttendanceInCity('SPLIT', XMAS)
    const sibenik = await seedAttendanceInCity('SIBENIK', XMAS)
    await sibenikAdminSession()

    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: XMAS,
      endDate: XMAS,
      name: 'Božić',
      confirmDeleteAttendance: true,
    })
    expect(res.success).toBe(true)

    const splitRow = await db.attendance.findUnique({ where: { id: split.attendance.id } })
    const sibenikRow = await db.attendance.findUnique({ where: { id: sibenik.attendance.id } })
    expect(splitRow).not.toBeNull() // Split data survives the Šibenik closure
    expect(sibenikRow).toBeNull() // own-city cascade applied

    const holidays = await db.schoolYearHoliday.findMany({ where: { schoolYear: SY } })
    expect(holidays).toHaveLength(1)
    expect(holidays[0].city).toBe('SIBENIK')
  })

  it('the confirmation preview counts only the caller city attendance', async () => {
    await seedAttendanceInCity('SPLIT', XMAS)
    await sibenikAdminSession()

    // Only Split has attendance on the date — a Šibenik admin needs no
    // confirmation, and the insert goes straight through.
    const res = await upsertHolidayRange({
      schoolYear: SY,
      startDate: XMAS,
      endDate: XMAS,
      name: 'Božić',
    })
    expect(res).toMatchObject({ success: true, requiresConfirmation: false })
    expect(await db.attendance.count()).toBe(1) // untouched
  })
})

describe('holiday CRUD — per-city rows', () => {
  it('listHolidays shows only the caller city; removeHoliday 404s cross-city; range delete is scoped', async () => {
    await splitAdminSession()
    await upsertHolidayRange({ schoolYear: SY, startDate: XMAS, endDate: XMAS, name: 'Božić' })
    const splitRow = (await db.schoolYearHoliday.findMany({ where: { city: 'SPLIT' } }))[0]

    await sibenikAdminSession()
    await upsertHolidayRange({ schoolYear: SY, startDate: XMAS, endDate: XMAS, name: 'Božić' })

    const listed = await listHolidays(SY)
    expect(listed).toHaveLength(1) // only Šibenik's row

    const removeRes = await removeHoliday({ id: splitRow.id })
    expect(removeRes).toEqual({ success: false, error: 'Praznik nije pronađen.' })

    const rangeRes = await removeHolidayRange({ schoolYear: SY, startDate: XMAS, endDate: XMAS })
    expect(rangeRes.success).toBe(true)
    const remaining = await db.schoolYearHoliday.findMany({ where: { schoolYear: SY } })
    expect(remaining.map((h) => h.city)).toEqual(['SPLIT']) // Split's survives
  })
})

describe('completeSchoolYearPlan — per-city one-shot', () => {
  async function seedFourStandardCourses() {
    const courses = await Promise.all([0, 1, 2, 3].map(() => createCourse({ isCustom: false })))
    for (const c of courses) {
      for (let i = 0; i < 4; i++) {
        await createModule(c.id, { sortOrder: i, title: `Modul ${i + 1}` })
      }
    }
    return courses
  }

  it('each city plans the shared curriculum independently; re-run within a city is blocked', async () => {
    await seedFourStandardCourses()

    await splitAdminSession()
    const splitRes = await completeSchoolYearPlan({ schoolYear: SY, startDate: '2026-09-01' })
    expect(splitRes).toEqual({ success: true })

    // Split already planned — Šibenik's FIRST run must still succeed with its
    // own (later) kickoff.
    await sibenikAdminSession()
    const sibenikRes = await completeSchoolYearPlan({ schoolYear: SY, startDate: '2026-11-02' })
    expect(sibenikRes).toEqual({ success: true })

    const split = await db.moduleSchedule.findMany({
      where: { schoolYear: SY, city: 'SPLIT' },
      orderBy: { startDate: 'asc' },
    })
    const sibenik = await db.moduleSchedule.findMany({
      where: { schoolYear: SY, city: 'SIBENIK' },
      orderBy: { startDate: 'asc' },
    })
    expect(split).toHaveLength(16)
    expect(sibenik).toHaveLength(16)
    // Divergent kickoffs → divergent first-module dates.
    expect(split[0].startDate?.toISOString()).not.toBe(sibenik[0].startDate?.toISOString())

    // One-shot guard is per city: Šibenik cannot re-plan its own year.
    const rerun = await completeSchoolYearPlan({ schoolYear: SY, startDate: '2026-11-09' })
    expect(rerun.success).toBe(false)
  })

  it('blocks planning an archived year server-side', async () => {
    await seedFourStandardCourses()
    await sibenikAdminSession()
    const res = await completeSchoolYearPlan({ schoolYear: ARCHIVED_SY, startDate: '2020-09-01' })
    expect(res.success).toBe(false)
  })
})

describe('module schedules and windows — per-city rows', () => {
  it('closeModuleSchedule reads a cross-city schedule as nonexistent and closes only its own', async () => {
    const course = await createCourse()
    const mod = await createModule(course.id)
    const endDate = new Date('2027-03-15T00:00:00.000Z')
    const splitSched = await createModuleSchedule(mod.id, {
      schoolYear: SY, city: 'SPLIT', startDate: new Date('2026-09-01T00:00:00.000Z'), endDate,
    })
    const sibenikSched = await createModuleSchedule(mod.id, {
      schoolYear: SY, city: 'SIBENIK', startDate: new Date('2026-11-02T00:00:00.000Z'), endDate,
    })
    await sibenikAdminSession()

    const cross = await closeModuleSchedule(splitSched.id)
    expect(cross).toEqual({ success: false, error: 'Modul nije pronađen.' })
    const splitAfter = await db.moduleSchedule.findUnique({ where: { id: splitSched.id } })
    expect(splitAfter?.endDate?.toISOString()).toBe(endDate.toISOString())

    const own = await closeModuleSchedule(sibenikSched.id)
    expect(own).toEqual({ success: true })
    const sibenikAfter = await db.moduleSchedule.findUnique({ where: { id: sibenikSched.id } })
    expect(sibenikAfter?.endDate?.toISOString()).not.toBe(endDate.toISOString())
  })

  it('addModuleEnrollment rejects a schedule from the other city', async () => {
    const course = await createCourse()
    const mod = await createModule(course.id)
    const splitSched = await createModuleSchedule(mod.id, { schoolYear: SY, city: 'SPLIT' })
    const sibenikSched = await createModuleSchedule(mod.id, { schoolYear: SY, city: 'SIBENIK' })

    const group = await createGroup({ city: 'SIBENIK', courseId: course.id, schoolYear: SY })
    const student = await createStudent({ city: 'SIBENIK' })
    const enrollment = await createEnrollment(student.id, group.id, { schoolYear: SY })
    await sibenikAdminSession()

    const cross = await addModuleEnrollment(enrollment.id, splitSched.id)
    expect(cross).toEqual({ success: false, error: 'Modul nije pronađen.' })
    expect(await db.moduleEnrollment.count({ where: { enrollmentId: enrollment.id } })).toBe(0)

    const own = await addModuleEnrollment(enrollment.id, sibenikSched.id)
    expect(own).toEqual({ success: true })
  })

  it('upsertModuleSchedule writes the caller city row and leaves the other city untouched', async () => {
    const course = await createCourse()
    const mod = await createModule(course.id)
    const splitStart = new Date('2026-09-01T00:00:00.000Z')
    const splitSched = await createModuleSchedule(mod.id, {
      schoolYear: SY, city: 'SPLIT', startDate: splitStart,
    })
    await sibenikAdminSession()

    const res = await upsertModuleSchedule({
      moduleId: mod.id,
      schoolYear: SY,
      startDate: '2026-11-02',
      endDate: '2026-12-20',
    })
    expect(res).toEqual({ success: true })

    const rows = await db.moduleSchedule.findMany({ where: { moduleId: mod.id, schoolYear: SY } })
    expect(rows).toHaveLength(2)
    const splitAfter = rows.find((r) => r.city === 'SPLIT')
    const sibenikAfter = rows.find((r) => r.city === 'SIBENIK')
    expect(splitAfter?.id).toBe(splitSched.id)
    expect(splitAfter?.startDate?.toISOString()).toBe(splitStart.toISOString())
    expect(sibenikAfter?.startDate?.toISOString()).toBe('2026-11-02T00:00:00.000Z')
  })

  it('upsertEnrollmentWindow opens the caller city window without clobbering the other city', async () => {
    const course = await createCourse()
    const splitStart = new Date('2026-06-01T00:00:00.000Z')
    await createEnrollmentWindow(course.id, {
      schoolYear: SY, city: 'SPLIT', enrollmentStart: splitStart,
      enrollmentEnd: new Date('2026-09-30T00:00:00.000Z'),
    })
    await sibenikAdminSession()

    const res = await upsertEnrollmentWindow({
      courseId: course.id,
      schoolYear: SY,
      enrollmentStart: '2026-10-01',
      enrollmentEnd: '2026-11-30',
    })
    expect(res).toEqual({ success: true })

    const windows = await db.courseEnrollmentWindow.findMany({
      where: { courseId: course.id, schoolYear: SY },
    })
    expect(windows).toHaveLength(2)
    const split = windows.find((w) => w.city === 'SPLIT')
    expect(split?.enrollmentStart?.toISOString()).toBe(splitStart.toISOString())
  })
})
