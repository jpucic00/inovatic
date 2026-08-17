/**
 * The editable razred→program rule.
 *
 * Šibenik launches SLR 4 a year after the rest of the ladder, so its 7. and 8.
 * razred are pointed at SLR 3 instead. The rule is per (course, school year,
 * city), and three things have to hold for that to be safe:
 *
 *   - the write path stamps the ADMIN'S OWN city, so one city's rule can never
 *     reshape the other's signup form;
 *   - only standard programs have a rule (radionice and the competitive track
 *     bypass the razred narrowing entirely);
 *   - `submitInquiry` re-checks "is a termin required" against the SAME rule the
 *     form rendered from — on the built-in ladder it would be wrong in both
 *     directions in an overriding city.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CourseLevel } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourseGradeRule,
  createEnrollmentWindow,
  createModule,
  createModuleSchedule,
  relativeDateKey,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import type { InquiryFormData } from '@/lib/validators/inquiry'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { upsertCourseGradeRule, resetCourseGradeRule } = await import(
  '@/actions/admin/course-grade-rule'
)
const { getActivePrograms, getCourseGradeRules } = await import('@/actions/public/programs')
const { submitInquiry } = await import('@/actions/inquiry')
const { programsForSelection } = await import('@/lib/inquiry-availability')

// submitInquiry mails on success when a key is present — keep the tier offline.
beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

const YEAR = '2026/2027'
const fx = fixtureScope()
const parentEmails: string[] = []
let emailCounter = 0

function uniqueEmail(): string {
  const email = `grade-rule-${Date.now().toString(36)}-${++emailCounter}@test.local`
  parentEmails.push(email)
  return email
}

afterAll(async () => {
  await db.inquiry.deleteMany({ where: { parentEmail: { in: parentEmails } } })
  await fx.cleanup()
})

/**
 * A standard program with an open signup window and one bookable group. The
 * module schedule is what gives the arc a "next enrolling module" — without it
 * `toActiveGroup` drops the group and every assertion here would pass vacuously.
 */
async function openStandardProgram(
  level: CourseLevel,
  city: 'SPLIT' | 'SIBENIK' = 'SIBENIK',
) {
  const course = await fx.course({ kind: 'STANDARD', level })
  const moduleRow = await createModule(course.id)
  await createModuleSchedule(moduleRow.id, {
    schoolYear: YEAR,
    city,
    startDate: new Date(`${relativeDateKey(30)}T00:00:00.000Z`),
    endDate: new Date(`${relativeDateKey(90)}T00:00:00.000Z`),
  })
  await createEnrollmentWindow(course.id, {
    schoolYear: YEAR,
    city,
    enrollmentStart: new Date('2020-01-01'),
    enrollmentEnd: new Date('2099-12-31'),
  })
  const group = await fx.group({ courseId: course.id, city, schoolYear: YEAR })
  return { course, group }
}

function inquiryFor(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SIBENIK',
    parentName: 'Test Roditelj',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2012-06-12',
    grade: '8',
    consent: true,
    ...overrides,
  }
}

describe('upsertCourseGradeRule', () => {
  it('stamps the admin\'s own city, never one from the payload', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const course = await fx.course({ kind: 'STANDARD' })

    const result = await upsertCourseGradeRule({
      courseId: course.id,
      schoolYear: YEAR,
      grades: ['5', '6', '7', '8'],
    })

    expect(result.success).toBe(true)
    const rows = await db.courseGradeRule.findMany({ where: { courseId: course.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].city).toBe('SIBENIK')
    expect(rows[0].grades).toEqual(['5', '6', '7', '8'])
  })

  it('saves an empty list — "offered to nobody" is an answer, not a no-op', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const course = await fx.course({ kind: 'STANDARD' })

    expect(
      (await upsertCourseGradeRule({ courseId: course.id, schoolYear: YEAR, grades: [] }))
        .success,
    ).toBe(true)
    const row = await db.courseGradeRule.findFirst({ where: { courseId: course.id } })
    expect(row?.grades).toEqual([])
  })

  it('overwrites the same (course, year, city) rather than stacking rows', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const course = await fx.course({ kind: 'STANDARD' })

    await upsertCourseGradeRule({ courseId: course.id, schoolYear: YEAR, grades: ['5'] })
    await upsertCourseGradeRule({ courseId: course.id, schoolYear: YEAR, grades: ['5', '6'] })

    const rows = await db.courseGradeRule.findMany({ where: { courseId: course.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].grades).toEqual(['5', '6'])
  })

  it('refuses a radionica and the competitive program', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const radionica = await fx.course({ kind: 'RADIONICA', schoolYear: YEAR, city: 'SIBENIK' })
    const competition = await fx.course({ kind: 'COMPETITION' })

    for (const course of [radionica, competition]) {
      const result = await upsertCourseGradeRule({
        courseId: course.id,
        schoolYear: YEAR,
        grades: ['5'],
      })
      expect(result.success).toBe(false)
      expect(await db.courseGradeRule.count({ where: { courseId: course.id } })).toBe(0)
    }
  })

  it('refuses an archived school year', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const course = await fx.course({ kind: 'STANDARD' })

    const result = await upsertCourseGradeRule({
      courseId: course.id,
      schoolYear: '2019/2020',
      grades: ['5'],
    })

    expect(result.success).toBe(false)
    expect(await db.courseGradeRule.count({ where: { courseId: course.id } })).toBe(0)
  })
})

describe('resetCourseGradeRule', () => {
  it('deletes only this city\'s row, leaving the other city\'s alone', async () => {
    const course = await fx.course({ kind: 'STANDARD' })
    await createCourseGradeRule(course.id, ['7', '8'], { schoolYear: YEAR, city: 'SIBENIK' })
    await createCourseGradeRule(course.id, ['1'], { schoolYear: YEAR, city: 'SPLIT' })

    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    expect((await resetCourseGradeRule({ courseId: course.id, schoolYear: YEAR })).success).toBe(
      true,
    )

    const remaining = await db.courseGradeRule.findMany({ where: { courseId: course.id } })
    expect(remaining.map((r) => r.city)).toEqual(['SPLIT'])
  })
})

describe('getCourseGradeRules', () => {
  it('returns only this city\'s rules', async () => {
    const { course } = await openStandardProgram('SLR_3', 'SIBENIK')
    await createCourseGradeRule(course.id, ['5', '6', '7', '8'], {
      schoolYear: YEAR,
      city: 'SIBENIK',
    })

    expect(await getCourseGradeRules('SIBENIK')).toMatchObject({
      [course.id]: ['5', '6', '7', '8'],
    })
    expect(await getCourseGradeRules('SPLIT')).not.toHaveProperty(course.id)
  })

  it('ignores a rule saved for a different school year', async () => {
    const { course } = await openStandardProgram('SLR_3', 'SIBENIK')
    // The program's open window is for YEAR; this rule belongs to the next one.
    await createCourseGradeRule(course.id, ['7', '8'], {
      schoolYear: '2027/2028',
      city: 'SIBENIK',
    })

    expect(await getCourseGradeRules('SIBENIK')).not.toHaveProperty(course.id)
  })

  it('resolves each course by its EARLIEST open window even when only the later year has a rule', async () => {
    // The summer overlap: this year's and next year's windows open at once. The
    // earlier year has NO rule — the default ladder — and the later year's rule
    // must not reach across into the enrollment already under way. (Regression:
    // the resolver used to mark a course "seen" only when a rule row existed,
    // so next year's `[]` would silently hide a program still on this year's
    // default ladder.)
    const { course } = await openStandardProgram('SLR_3', 'SIBENIK')
    await createEnrollmentWindow(course.id, {
      schoolYear: '2027/2028',
      city: 'SIBENIK',
      enrollmentStart: new Date('2020-01-01'),
      enrollmentEnd: new Date('2099-12-31'),
    })
    await createCourseGradeRule(course.id, [], { schoolYear: '2027/2028', city: 'SIBENIK' })

    expect(await getCourseGradeRules('SIBENIK')).not.toHaveProperty(course.id)
  })

  it('reads the rule for the year the program is enrolling FOR, not today\'s year', async () => {
    // The whole point: upisi for YEAR are open now, while computeSchoolYear()
    // still names the year that is ending.
    const { course } = await openStandardProgram('SLR_3', 'SIBENIK')
    await createCourseGradeRule(course.id, ['5', '6', '7', '8'], {
      schoolYear: YEAR,
      city: 'SIBENIK',
    })

    const rules = await getCourseGradeRules('SIBENIK')
    const programs = await getActivePrograms('SIBENIK')

    expect(programsForSelection(programs, '8', undefined, rules).map((p) => p.id)).toContain(
      course.id,
    )
    // Without the rule, 8. razred maps to SLR 4 — which Šibenik does not run.
    expect(programsForSelection(programs, '8').map((p) => p.id)).not.toContain(course.id)
  })
})

describe('submitInquiry honours the razred rule', () => {
  it('requires a termin for a razred the rule redirects onto an open program', async () => {
    const { course, group } = await openStandardProgram('SLR_3', 'SIBENIK')
    await createCourseGradeRule(course.id, ['5', '6', '7', '8'], {
      schoolYear: YEAR,
      city: 'SIBENIK',
    })

    const form = inquiryFor({ grade: '8' })
    const res = await submitInquiry(form)

    expect(res.success).toBe(false)
    if (res.success || !('code' in res)) throw new Error('expected a TERMIN_REQUIRED result')
    expect(res.code).toBe('TERMIN_REQUIRED')
    // The refusal carries the rules it was decided against, so a form rendered
    // before the admin's edit can re-render against the same view of the world.
    if (res.code !== 'TERMIN_REQUIRED') throw new Error('narrowing')
    expect(res.gradeRules[course.id]).toEqual(['5', '6', '7', '8'])
    expect(res.programs.flatMap((p) => p.groups.map((g) => g.id))).toContain(group.id)
    expect(await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })).toBeNull()
  })

  it('accepts the termin the rule made available', async () => {
    const { course, group } = await openStandardProgram('SLR_3', 'SIBENIK')
    await createCourseGradeRule(course.id, ['5', '6', '7', '8'], {
      schoolYear: YEAR,
      city: 'SIBENIK',
    })

    const form = inquiryFor({ grade: '8', courseId: course.id, scheduledGroupId: group.id })
    expect(await submitInquiry(form)).toMatchObject({ success: true })

    const inquiry = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(inquiry?.scheduledGroupId).toBe(group.id)
    expect(inquiry?.childGrade).toBe('8')
  })

  it('relaxes the built-in requirement when the rule pulls a razred off an open program', async () => {
    // SLR 4 open in Šibenik with a bookable termin — the default ladder demands
    // a termin for 8. razred. A rule handing the razred to someone else means a
    // termin-less submission must go straight through: this is the second
    // direction of "wrong in both directions", and the one a parent cannot work
    // around (the form never offered them a termin to pick).
    const { course } = await openStandardProgram('SLR_4', 'SIBENIK')

    // The gate asks whether ANY open program offers this razred a termin, and
    // earlier tests leave open SIBENIK programs whose rules claim 8. razred —
    // retire every other open program first, so the only claim left is this
    // course's own default (SLR 4 ⇒ 7.–8. razred).
    const now = new Date()
    const open = await db.courseEnrollmentWindow.findMany({
      where: { city: 'SIBENIK', enrollmentStart: { lte: now }, enrollmentEnd: { gte: now } },
      select: { courseId: true, schoolYear: true },
    })
    for (const w of open) {
      if (w.courseId === course.id) continue
      await db.courseGradeRule.upsert({
        where: {
          courseId_schoolYear_city: {
            courseId: w.courseId,
            schoolYear: w.schoolYear,
            city: 'SIBENIK',
          },
        },
        create: { courseId: w.courseId, schoolYear: w.schoolYear, city: 'SIBENIK', grades: [] },
        update: { grades: [] },
      })
    }

    // Anti-vacuous guard: with no rule on THIS course, the payload is refused.
    const refused = await submitInquiry(inquiryFor({ grade: '8' }))
    expect(refused.success).toBe(false)

    await createCourseGradeRule(course.id, ['7'], { schoolYear: YEAR, city: 'SIBENIK' })

    const form = inquiryFor({ grade: '8' })
    expect(await submitInquiry(form)).toMatchObject({ success: true })
    const inquiry = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(inquiry?.scheduledGroupId).toBeNull()
  })

  it('leaves a city without a rule on the default ladder', async () => {
    // Same SLR 3 shape in Split, no rule: 8. razred maps to SLR 4, which has no
    // open program here, so the termin stays optional exactly as before.
    const { course } = await openStandardProgram('SLR_3', 'SPLIT')

    const res = await submitInquiry(inquiryFor({ city: 'SPLIT', grade: '8' }))

    expect(res).toMatchObject({ success: true })
    expect(await getCourseGradeRules('SPLIT')).not.toHaveProperty(course.id)
  })

  it('does not let one city\'s rule reshape the other\'s form', async () => {
    const { course } = await openStandardProgram('SLR_3', 'SPLIT')
    // A Šibenik rule on the SHARED standard course must not reach Split.
    await createCourseGradeRule(course.id, ['5', '6', '7', '8'], {
      schoolYear: YEAR,
      city: 'SIBENIK',
    })

    const splitRules = await getCourseGradeRules('SPLIT')
    const splitPrograms = await getActivePrograms('SPLIT')

    expect(splitRules).not.toHaveProperty(course.id)
    // The program IS in Split's feed — for its own default razred. Without this
    // the assertion below would pass on an empty feed.
    expect(programsForSelection(splitPrograms, '5').map((p) => p.id)).toContain(course.id)
    expect(
      programsForSelection(splitPrograms, '8', undefined, splitRules).map((p) => p.id),
    ).not.toContain(course.id)
  })
})
