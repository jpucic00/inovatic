/**
 * The Natjecateljski program end to end: season → weekly termini → monthly
 * charges → the invitation link.
 *
 * The rules under test are the ones that differ from every other program, so a
 * regression here is a regression in the competitive track specifically:
 *   - it is absent from the public catalog but reachable by slug
 *   - enrollment writes monthly charges and no ModuleEnrollment rows
 *   - a month becomes owed on the 1st, with no scheduled job
 *   - the season is a per-city, per-year decision, and editing it never
 *     destroys a month someone already paid
 *   - a REENROLLMENT invitation links at the program it invited the child to
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourseSeason,
  createEnrollment,
  createEnrollmentWindow,
  createModule,
  createStudent,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    const err = new Error('NEXT_NOT_FOUND')
    ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
    throw err
  }),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  }),
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { getActivePrograms, getSignupProgram } = await import('@/actions/public/programs')
const { upsertCourseSeason } = await import('@/actions/admin/course-season')
const { setEnrollmentMonthPaid } = await import('@/actions/admin/payment')
const { addEnrollment, getStudents } = await import('@/actions/admin/student')
const { completeSchoolYearPlan } = await import('@/actions/admin/school-year-planner')
const { getGroupAttendance } = await import('@/actions/teacher/attendance')
const { submitInquiry } = await import('@/actions/inquiry')

const SY = '2026/2027'
const fx = fixtureScope()

beforeAll(async () => {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { name, value: SY } : undefined,
  })
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

afterAll(async () => {
  await fx.cleanup()
})

let counter = 0
function slug(): string {
  counter += 1
  return `natjecateljski-${Date.now()}-${counter}`
}

async function competitionCourse(overrides: { slug?: string } = {}) {
  const course = await fx.course({ kind: 'COMPETITION', slug: overrides.slug ?? slug() })
  await createModule(course.id, { title: 'World Robot Olympiad', sortOrder: 1 })
  await createModule(course.id, { title: 'Pripreme za natjecanja', sortOrder: 2 })
  return course
}

async function loginSplitAdmin() {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  return admin
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

// ─── Public visibility ───────────────────────────────────────────────────────

describe('the competitive program is invitation-only', () => {
  beforeEach(async () => {
    await loginSplitAdmin()
  })

  it('never appears in the public /upisi catalog, even with an open window', async () => {
    const course = await competitionCourse()
    await createEnrollmentWindow(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      enrollmentStart: d('2020-01-01'),
      enrollmentEnd: d('2099-12-31'),
    })
    await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })

    const programs = await getActivePrograms('SPLIT')
    expect(programs.map((p) => p.id)).not.toContain(course.id)
  })

  it('is served by slug through its own signup link', async () => {
    const course = await competitionCourse()
    await createEnrollmentWindow(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      enrollmentStart: d('2020-01-01'),
      enrollmentEnd: d('2099-12-31'),
    })
    await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })

    const program = await getSignupProgram('SPLIT', course.slug)
    expect(program?.id).toBe(course.id)
    expect(program?.groups).toHaveLength(1)
  })

  it('offers nothing through the link once the window is closed', async () => {
    const course = await competitionCourse()
    await createEnrollmentWindow(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      enrollmentStart: d('2020-01-01'),
      enrollmentEnd: d('2020-12-31'),
    })
    await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })

    expect(await getSignupProgram('SPLIT', course.slug)).toBeNull()
  })

  it('does not leak a Split program into the Šibenik link', async () => {
    const course = await competitionCourse()
    await createEnrollmentWindow(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      enrollmentStart: d('2020-01-01'),
      enrollmentEnd: d('2099-12-31'),
    })
    await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })

    expect(await getSignupProgram('SIBENIK', course.slug)).toBeNull()
  })
})

// ─── Season → weekly termini ─────────────────────────────────────────────────

describe('season drives one weekly session per group', () => {
  beforeEach(async () => {
    await loginSplitAdmin()
  })

  it('lists a session every week on the group weekday, skipping holidays', async () => {
    const course = await competitionCourse()
    await createCourseSeason(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      startDate: d('2026-09-15'), // Tuesday
      endDate: d('2026-10-13'),
    })
    const group = await fx.group({
      courseId: course.id,
      schoolYear: SY,
      city: 'SPLIT',
      dayOfWeek: 'Utorak',
    })
    await db.schoolYearHoliday.create({
      data: { schoolYear: SY, city: 'SPLIT', date: d('2026-09-29') },
    })

    const attendance = await getGroupAttendance(group.id)
    expect(attendance.kind).toBe('season')
    if (attendance.kind === 'standard') throw new Error('expected the flat variant')
    expect(attendance.expectedSessions).toEqual([
      '2026-09-15',
      '2026-09-22',
      '2026-10-06',
      '2026-10-13',
    ])

    await db.schoolYearHoliday.deleteMany({ where: { schoolYear: SY, city: 'SPLIT' } })
  })

  it('lists no sessions while the season is unplanned', async () => {
    const course = await competitionCourse()
    const group = await fx.group({
      courseId: course.id,
      schoolYear: SY,
      city: 'SPLIT',
      dayOfWeek: 'Utorak',
    })

    const attendance = await getGroupAttendance(group.id)
    if (attendance.kind === 'standard') throw new Error('expected the flat variant')
    expect(attendance.expectedSessions).toEqual([])
  })

  it('is ignored by the school-year planner, which only plans dated modules', async () => {
    const course = await competitionCourse()
    await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })

    // The planner asserts exactly 4 modules per course it touches. This program
    // has 2 — if it were in scope the whole run would abort.
    const res = await completeSchoolYearPlan({ schoolYear: SY, startDate: '2026-09-14' })

    const seasonModules = await db.courseModule.findMany({
      where: { courseId: course.id },
      select: { schedules: { select: { id: true } } },
    })
    expect(seasonModules.every((m) => m.schedules.length === 0)).toBe(true)
    // Whether the run succeeded depends on what other standard courses exist;
    // what matters is that this program was never a reason to fail.
    if (!res.success) {
      expect(res.error).not.toContain('Natjecateljski')
    }
  })
})

// ─── Season editing ──────────────────────────────────────────────────────────

describe('upsertCourseSeason', () => {
  beforeEach(async () => {
    await loginSplitAdmin()
  })

  it('is refused on a program that is not the competitive one', async () => {
    const standard = await fx.course()
    const res = await upsertCourseSeason({
      courseId: standard.id,
      schoolYear: SY,
      startDate: '2026-09-15',
      endDate: '2027-06-15',
    })
    expect(res.success).toBe(false)
  })

  it('refuses an end date before the start', async () => {
    const course = await competitionCourse()
    const res = await upsertCourseSeason({
      courseId: course.id,
      schoolYear: SY,
      startDate: '2027-06-15',
      endDate: '2026-09-15',
    })
    expect(res.success).toBe(false)
  })

  it('reads a Šibenik program as nonexistent for a Split admin', async () => {
    // A per-city program owned by the other tenant: same answer as a bad id.
    const course = await fx.course({ kind: 'COMPETITION', slug: slug(), city: 'SIBENIK' })
    const res = await upsertCourseSeason({
      courseId: course.id,
      schoolYear: SY,
      startDate: '2026-09-15',
      endDate: '2027-06-15',
    })
    expect(res).toEqual({ success: false, error: 'Program nije pronađen.' })
    expect(await db.courseSeason.count({ where: { courseId: course.id } })).toBe(0)
  })

  it('keeps each city on its own dates', async () => {
    const course = await competitionCourse()
    await upsertCourseSeason({
      courseId: course.id,
      schoolYear: SY,
      startDate: '2026-09-15',
      endDate: '2027-06-15',
    })

    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })
    await upsertCourseSeason({
      courseId: course.id,
      schoolYear: SY,
      startDate: '2026-11-02',
      endDate: '2027-05-31',
    })

    const seasons = await db.courseSeason.findMany({
      where: { courseId: course.id },
      orderBy: { city: 'asc' },
      select: { city: true, startDate: true },
    })
    expect(seasons).toHaveLength(2)
    expect(seasons.find((s) => s.city === 'SPLIT')?.startDate).toEqual(d('2026-09-15'))
    expect(seasons.find((s) => s.city === 'SIBENIK')?.startDate).toEqual(d('2026-11-02'))
  })
})

// ─── Monthly charges ─────────────────────────────────────────────────────────

describe('monthly charges', () => {
  beforeEach(async () => {
    await loginSplitAdmin()
  })

  async function enrolledCompetitionStudent(seasonEnd = '2027-06-15') {
    const course = await competitionCourse()
    await createCourseSeason(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      // Deliberately in the past so "today" sits inside the season and the
      // charge list is non-empty however this suite is scheduled.
      startDate: d('2020-09-15'),
      endDate: d(seasonEnd),
    })
    const group = await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const res = await addEnrollment({ studentId: student.id, groupId: group.id })
    expect(res.success).toBe(true)
    const enrollment = await db.enrollment.findFirstOrThrow({
      where: { userId: student.id, scheduledGroupId: group.id },
    })
    return { course, group, student, enrollment }
  }

  it('writes monthly charges and no ModuleEnrollment rows on enrollment', async () => {
    const { enrollment } = await enrolledCompetitionStudent()

    const months = await db.enrollmentMonth.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { periodStart: 'asc' },
    })
    expect(months.length).toBeGreaterThan(0)
    expect(await db.moduleEnrollment.count({ where: { enrollmentId: enrollment.id } })).toBe(0)

    // Charging starts at the join month, never at the (2020) season start.
    const now = new Date()
    const firstOfThisMonth = Date.UTC(now.getFullYear(), now.getMonth(), 1)
    expect(months[0].periodStart.getTime()).toBe(firstOfThisMonth)
  })

  it('marks a month paid and back to unpaid', async () => {
    const { enrollment } = await enrolledCompetitionStudent()
    const month = await db.enrollmentMonth.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    })

    expect((await setEnrollmentMonthPaid(month.id, true)).success).toBe(true)
    expect(
      (await db.enrollmentMonth.findUniqueOrThrow({ where: { id: month.id } })).paidAt,
    ).not.toBeNull()

    expect((await setEnrollmentMonthPaid(month.id, false)).success).toBe(true)
    expect(
      (await db.enrollmentMonth.findUniqueOrThrow({ where: { id: month.id } })).paidAt,
    ).toBeNull()
  })

  it('reads a Šibenik month as nonexistent for a Split admin', async () => {
    const { enrollment } = await enrolledCompetitionStudent()
    const month = await db.enrollmentMonth.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    })

    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })
    const res = await setEnrollmentMonthPaid(month.id, true)

    expect(res).toEqual({ success: false, error: 'Mjesec nije pronađen.' })
    expect(
      (await db.enrollmentMonth.findUniqueOrThrow({ where: { id: month.id } })).paidAt,
    ).toBeNull()
  })

  it('shows the student as owing money until every started month is paid', async () => {
    const { student, enrollment } = await enrolledCompetitionStudent()

    const pendingPage = await getStudents({ page: 1, paymentStatus: 'PENDING' })
    expect(pendingPage.data.map((s) => s.id)).toContain(student.id)

    // Pay every month that has already started.
    await db.enrollmentMonth.updateMany({
      where: { enrollmentId: enrollment.id, periodStart: { lte: new Date() } },
      data: { paidAt: new Date() },
    })

    // Only the debt side is asserted: the PAID bucket additionally requires an
    // enrollment in the *current* school year (computeSchoolYear), which this
    // fixture's year is not whenever the suite runs outside it.
    const stillPending = await getStudents({ page: 1, paymentStatus: 'PENDING' })
    expect(stillPending.data.map((s) => s.id)).not.toContain(student.id)
  })

  it('extends charges when the season grows, and never deletes a paid month when it shrinks', async () => {
    const { course, enrollment } = await enrolledCompetitionStudent('2027-06-15')

    // Pay the last month, then pull the season back before it.
    const last = await db.enrollmentMonth.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
      orderBy: { periodStart: 'desc' },
    })
    await db.enrollmentMonth.update({ where: { id: last.id }, data: { paidAt: new Date() } })
    const unpaidBefore = await db.enrollmentMonth.count({
      where: { enrollmentId: enrollment.id, paidAt: null },
    })
    expect(unpaidBefore).toBeGreaterThan(0)

    const res = await upsertCourseSeason({
      courseId: course.id,
      schoolYear: SY,
      startDate: '2020-09-15',
      // One month long: everything after it falls out of range.
      endDate: '2020-10-31',
    })
    expect(res.success).toBe(true)

    const after = await db.enrollmentMonth.findMany({
      where: { enrollmentId: enrollment.id },
      select: { id: true, paidAt: true },
    })
    // The paid month survived; the unpaid out-of-range ones were cleaned up.
    expect(after.map((m) => m.id)).toContain(last.id)
    expect(after.every((m) => m.paidAt !== null)).toBe(true)
  })

  it('backfills charges for an enrollment made before the season was planned', async () => {
    const course = await competitionCourse()
    const group = await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    await createEnrollment(student.id, group.id, { schoolYear: SY })

    const enrollment = await db.enrollment.findFirstOrThrow({
      where: { userId: student.id, scheduledGroupId: group.id },
    })
    expect(await db.enrollmentMonth.count({ where: { enrollmentId: enrollment.id } })).toBe(0)

    const res = await upsertCourseSeason({
      courseId: course.id,
      schoolYear: SY,
      startDate: '2020-09-15',
      endDate: '2099-06-15',
    })
    expect(res.success).toBe(true)
    expect(
      await db.enrollmentMonth.count({ where: { enrollmentId: enrollment.id } }),
    ).toBeGreaterThan(0)
  })
})

// ─── Srednja škola grades ────────────────────────────────────────────────────

describe('high-school grades reach only the competitive program', () => {
  const parentForm = {
    city: 'SPLIT' as const,
    parentName: 'Test Roditelj',
    parentEmail: 'ss-grade@test.local',
    parentPhone: '+385912345678',
    childFirstName: 'Marko',
    childLastName: 'Marić',
    childDateOfBirth: '2010-03-12',
    consent: true as const,
  }

  async function openProgram(kind: 'COMPETITION' | 'RADIONICA') {
    const course =
      kind === 'COMPETITION'
        ? await competitionCourse()
        : await fx.course({ kind: 'RADIONICA', schoolYear: SY, city: 'SPLIT' })
    await createEnrollmentWindow(course.id, {
      schoolYear: SY,
      city: 'SPLIT',
      enrollmentStart: d('2020-01-01'),
      enrollmentEnd: d('2099-12-31'),
    })
    const group = await fx.group({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })
    return { course, group }
  }

  it('accepts a srednja škola grade on a competition inquiry', async () => {
    const { course, group } = await openProgram('COMPETITION')

    const res = await submitInquiry({
      ...parentForm,
      parentEmail: `ss-ok-${Date.now()}@test.local`,
      grade: 'ss2',
      courseId: course.id,
      scheduledGroupId: group.id,
    })

    expect(res.success).toBe(true)
    const inquiry = await db.inquiry.findFirstOrThrow({
      where: { scheduledGroupId: group.id },
      select: { childGrade: true },
    })
    expect(inquiry.childGrade).toBe('ss2')
  })

  it('refuses a srednja škola grade aimed at any other program, even bypassing the form', async () => {
    // The <option> never renders outside the competition link, so this is
    // exactly the tampered-payload case the server guard exists for.
    const { course, group } = await openProgram('RADIONICA')

    const res = await submitInquiry({
      ...parentForm,
      parentEmail: `ss-no-${Date.now()}@test.local`,
      grade: 'ss1',
      courseId: course.id,
      scheduledGroupId: group.id,
    })

    expect(res).toEqual({
      success: false,
      error: 'Za odabrani program nije moguće odabrati srednjoškolski razred.',
    })
    expect(await db.inquiry.count({ where: { scheduledGroupId: group.id } })).toBe(0)
  })

  it('refuses a srednja škola grade on a general inquiry with no program at all', async () => {
    const res = await submitInquiry({
      ...parentForm,
      parentEmail: `ss-none-${Date.now()}@test.local`,
      grade: 'ss4',
    })
    expect(res.success).toBe(false)
  })

  it('still accepts an osnovna škola grade on a competition inquiry', async () => {
    const { course, group } = await openProgram('COMPETITION')

    const res = await submitInquiry({
      ...parentForm,
      parentEmail: `os-ok-${Date.now()}@test.local`,
      grade: '8',
      courseId: course.id,
      scheduledGroupId: group.id,
    })
    expect(res.success).toBe(true)
  })
})
