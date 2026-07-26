import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createLocation,
  createStudent,
} from './helpers/factory'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

// Mock the Resend SDK so the real sender service runs but nothing hits the
// network; `sendMock` is the controllable emails.send.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined ? { value, name } : undefined,
  })
}

// Relative years so the suite never ages into the archived-target guard:
// TARGET (the admin's selected year) is always next year, SOURCE the current.
const SOURCE_YEAR = computeSchoolYear()
const TARGET_YEAR = getNextSchoolYear(SOURCE_YEAR)
const ARCHIVED_YEAR = '2019/2020'

const {
  getEmailCampaigns,
  getEmailGroupTree,
  previewEmailHtml,
  previewEmailRecipients,
  sendEmailCampaign,
} = await import('@/actions/admin/email-campaign')

let seq = 0
const uniqEmail = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}@test.hr`

const CONTENT = {
  subject: 'Testna kampanja – Inovatic',
  bodyText: 'Ovo je testna poruka roditeljima naših polaznika.',
}

async function makeSourceGroup(opts: { city?: City; isCustom?: boolean } = {}) {
  const city = opts.city ?? 'SPLIT'
  const location = await createLocation({ city })
  const course = await createCourse({ isCustom: opts.isCustom ?? false })
  const group = await createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: SOURCE_YEAR,
    city,
    dayOfWeek: 'Utorak',
    startTime: '17:00',
    endTime: '18:30',
  })
  return { city, course, group }
}

async function enrollStudent(
  groupId: string,
  opts: {
    parentEmail?: string | null
    parentName?: string | null
    city?: City
    deletedAt?: Date | null
    firstName?: string
    lastName?: string
  } = {},
) {
  const student = await createStudent({
    parentEmail: opts.parentEmail ?? null,
    parentName: opts.parentName ?? 'Roditelj Testni',
    city: opts.city ?? 'SPLIT',
    deletedAt: opts.deletedAt ?? null,
    firstName: opts.firstName ?? 'Marko',
    lastName: opts.lastName ?? 'Anić',
  })
  await createEnrollment(student.id, groupId, { schoolYear: SOURCE_YEAR })
  return student
}

async function makeTarget(city: City = 'SPLIT') {
  const location = await createLocation({ city })
  const course = await createCourse()
  const group = await createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: TARGET_YEAR,
    city,
    dayOfWeek: 'Četvrtak',
    startTime: '18:30',
    endTime: '20:00',
  })
  return { course, group }
}

async function loginAdmin(city: City = 'SPLIT') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
}

beforeAll(async () => {
  // Reach the (mocked) send path — without a key the senders no-op.
  process.env.RESEND_API_KEY = 'test_resend_key'
  await db.schoolYear.upsert({ where: { label: TARGET_YEAR }, update: {}, create: { label: TARGET_YEAR } })
  await db.schoolYear.upsert({ where: { label: ARCHIVED_YEAR }, update: {}, create: { label: ARCHIVED_YEAR } })
})

afterAll(() => {
  delete process.env.RESEND_API_KEY
})

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({ data: { id: 'sent' }, error: null })
  setCookie(TARGET_YEAR)
})

describe('sendEmailCampaign — CUSTOM', () => {
  it('unions groups across two programs, mails each parent once, persists campaign + recipient rows', async () => {
    await loginAdmin()
    const a = await makeSourceGroup()
    const b = await makeSourceGroup()
    const parentA = uniqEmail('parent-a')
    const parentB = uniqEmail('parent-b')
    await enrollStudent(a.group.id, { parentEmail: parentA })
    await enrollStudent(b.group.id, { parentEmail: parentB })

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [a.group.id, b.group.id],
      ...CONTENT,
    })

    expect(res).toMatchObject({ success: true, sent: 2, excluded: 0, alreadySent: 0, failed: [] })
    expect(sendMock).toHaveBeenCalledTimes(2)
    const tos = sendMock.mock.calls.map((c) => c[0].to).sort()
    expect(tos).toEqual([parentA, parentB].sort())

    const campaign = await db.emailCampaign.findFirst({
      where: { kind: 'CUSTOM', sourceGroupIds: { hasEvery: [a.group.id, b.group.id] } },
      include: { recipients: true },
    })
    expect(campaign).not.toBeNull()
    expect(campaign?.city).toBe('SPLIT')
    expect(campaign?.sentCount).toBe(2)
    expect(campaign?.subject).toBe(CONTENT.subject)
    expect(campaign?.recipients.filter((r) => r.status === 'SENT')).toHaveLength(2)
  })

  it('is repeatable — the same cohort can receive a second custom campaign', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup()
    await enrollStudent(group.id, { parentEmail: uniqEmail('repeat') })
    const input = {
      kind: 'CUSTOM' as const,
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    }

    const first = await sendEmailCampaign(input)
    const second = await sendEmailCampaign(input)

    expect(first).toMatchObject({ success: true, sent: 1 })
    expect(second).toMatchObject({ success: true, sent: 1, alreadySent: 0 })
    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(
      await db.emailCampaign.count({ where: { sourceGroupIds: { has: group.id } } }),
    ).toBe(2)
  })

  it('accepts radionica groups in the custom kind', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup({ isCustom: true })
    await enrollStudent(group.id, { parentEmail: uniqEmail('radionica') })

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    expect(res).toMatchObject({ success: true, sent: 1 })
  })

  it('dedupes siblings into one send and merges child names in the preview', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup()
    const shared = uniqEmail('siblings')
    await enrollStudent(group.id, { parentEmail: shared, firstName: 'Marko' })
    await enrollStudent(group.id, { parentEmail: shared, firstName: 'Luka' })

    const preview = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
    })
    expect(preview.success).toBe(true)
    if (preview.success) {
      expect(preview.recipients).toHaveLength(1)
      expect(preview.recipients[0].children).toHaveLength(2)
    }

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    expect(res).toMatchObject({ success: true, sent: 1 })
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes the dirty legacy format and reports missing emails as skipped', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup()
    await enrollStudent(group.id, { parentEmail: 'Mama Anić <MAMA@test.hr>' })
    const noEmail = await enrollStudent(group.id, { parentEmail: null, firstName: 'Bez', lastName: 'Adrese' })

    const preview = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
    })
    expect(preview.success).toBe(true)
    if (preview.success) {
      expect(preview.recipients.map((r) => r.parentEmail)).toEqual(['mama@test.hr'])
      expect(preview.skipped).toEqual([
        { studentId: noEmail.id, studentName: 'Bez Adrese', reason: 'MISSING_EMAIL' },
      ])
    }

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    expect(res).toMatchObject({ success: true, sent: 1, skipped: [expect.objectContaining({ reason: 'MISSING_EMAIL' })] })
    expect(sendMock.mock.calls[0][0].to).toBe('mama@test.hr')
  })

  it('subtracts excluded emails (case-insensitively); unknown exclusions are harmless', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup()
    const keep = uniqEmail('keep')
    const drop = uniqEmail('drop')
    await enrollStudent(group.id, { parentEmail: keep })
    await enrollStudent(group.id, { parentEmail: drop })

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      excludedParentEmails: [`  ${drop.toUpperCase()}  `, 'unknown@nowhere.hr'],
      ...CONTENT,
    })

    expect(res).toMatchObject({ success: true, sent: 1, excluded: 1 })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].to).toBe(keep)

    const campaign = await db.emailCampaign.findFirst({
      where: { sourceGroupIds: { has: group.id } },
    })
    expect(campaign?.excludedCount).toBe(1)
  })

  it('never resolves soft-deleted students', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup()
    await enrollStudent(group.id, { parentEmail: uniqEmail('deleted'), deletedAt: new Date() })

    const preview = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
    })
    expect(preview.success).toBe(true)
    if (preview.success) expect(preview.recipients).toHaveLength(0)
  })
})

describe('sendEmailCampaign — REENROLLMENT', () => {
  it('rejects a radionica group smuggled into the source selection', async () => {
    await loginAdmin()
    const standard = await makeSourceGroup()
    const radionica = await makeSourceGroup({ isCustom: true })
    await enrollStudent(standard.group.id, { parentEmail: uniqEmail('std') })
    const target = await makeTarget()

    const res = await sendEmailCampaign({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [standard.group.id, radionica.group.id],
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    })
    expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('is idempotent per parent × target program+year, even across differently-sourced campaigns', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    const p1 = uniqEmail('inv-a')
    const p2 = uniqEmail('inv-b')
    await enrollStudent(source.group.id, { parentEmail: p1 })
    await enrollStudent(source.group.id, { parentEmail: p2 })
    const target = await makeTarget()
    const input = {
      kind: 'REENROLLMENT' as const,
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    }

    const first = await sendEmailCampaign(input)
    expect(first).toMatchObject({ success: true, sent: 2, alreadySent: 0 })

    sendMock.mockClear()
    const second = await sendEmailCampaign(input)
    expect(second).toMatchObject({ success: true, sent: 0, alreadySent: 2 })
    expect(sendMock).not.toHaveBeenCalled()

    // A different source cohort containing p1 still skips them for this target.
    const otherSource = await makeSourceGroup()
    await enrollStudent(otherSource.group.id, { parentEmail: p1 })
    const third = await sendEmailCampaign({
      ...input,
      sourceGroupIds: [otherSource.group.id],
    })
    expect(third).toMatchObject({ success: true, sent: 0, alreadySent: 1 })

    // The recipient preview surfaces the same skip-set.
    const preview = await previewEmailRecipients({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      targetCourseId: target.course.id,
    })
    expect(preview.success).toBe(true)
    if (preview.success) expect(preview.alreadySent.sort()).toEqual([p1, p2].sort())
  })

  it('accounts a mid-loop failure and retries only the failed parent on re-run', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    // Recipients are processed in email order — "a-…" fails, "b-…" succeeds.
    const failing = uniqEmail('a-fail')
    const fine = uniqEmail('b-ok')
    await enrollStudent(source.group.id, { parentEmail: failing })
    await enrollStudent(source.group.id, { parentEmail: fine })
    const target = await makeTarget()
    const input = {
      kind: 'REENROLLMENT' as const,
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    }

    sendMock.mockRejectedValueOnce(new Error('resend down'))
    const first = await sendEmailCampaign(input)
    expect(first).toMatchObject({ success: true, sent: 1, failed: [failing] })

    const rows = await db.emailCampaignRecipient.findMany({
      where: { parentEmail: { in: [failing, fine] } },
      select: { parentEmail: true, status: true },
    })
    expect(rows).toEqual(
      expect.arrayContaining([
        { parentEmail: failing, status: 'FAILED' },
        { parentEmail: fine, status: 'SENT' },
      ]),
    )

    sendMock.mockClear()
    sendMock.mockResolvedValue({ data: { id: 'sent' }, error: null })
    const second = await sendEmailCampaign(input)
    expect(second).toMatchObject({ success: true, sent: 1, alreadySent: 1, failed: [] })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].to).toBe(failing)
  })

  it('surfaces each child’s source-year preporuka in the invitation recipient preview', async () => {
    const admin = await loginAdmin()
    const source = await makeSourceGroup()
    const recommended = await createCourse({ title: 'Svijet LEGO Robotike 3' })
    const withCourse = await enrollStudent(source.group.id, { parentEmail: uniqEmail('rec-a'), firstName: 'Ana' })
    const withTrack = await enrollStudent(source.group.id, { parentEmail: uniqEmail('rec-b'), firstName: 'Bruno' })
    const without = await enrollStudent(source.group.id, { parentEmail: uniqEmail('rec-c'), firstName: 'Cvita' })
    await db.studentAssessment.create({
      data: {
        studentId: withCourse.id,
        groupId: source.group.id,
        authorId: admin.id,
        recommendationKind: 'COURSE',
        recommendedCourseId: recommended.id,
      },
    })
    await db.studentAssessment.create({
      data: {
        studentId: withTrack.id,
        groupId: source.group.id,
        authorId: admin.id,
        recommendationKind: 'COMPETITION_PREP',
      },
    })

    const preview = await previewEmailRecipients({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
    })
    expect(preview.success).toBe(true)
    if (preview.success) {
      const byId = new Map(
        [withCourse, withTrack, without].map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
      )
      const children = preview.recipients.flatMap((r) => r.children)
      expect(children.find((c) => c.name === byId.get(withCourse.id))?.recommendation).toBe(
        'Svijet LEGO Robotike 3',
      )
      expect(children.find((c) => c.name === byId.get(withTrack.id))?.recommendation).toBe(
        'Priprema za natjecanja',
      )
      expect(children.find((c) => c.name === byId.get(without.id))?.recommendation).toBeNull()
    }

    // Kind-gated: the custom kind never loads assessments.
    const customPreview = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
    })
    expect(customPreview.success).toBe(true)
    if (customPreview.success) {
      expect(customPreview.recipients.flatMap((r) => r.children).every((c) => c.recommendation === null)).toBe(true)
    }
  })

  it('refuses to send invitations while an archived year is selected', async () => {
    await loginAdmin()
    setCookie(ARCHIVED_YEAR)
    const source = await makeSourceGroup()
    await enrollStudent(source.group.id, { parentEmail: uniqEmail('arch') })
    const target = await makeTarget()

    const res = await sendEmailCampaign({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('tekuću školsku godinu')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it("rejects a target group that belongs to a different course", async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    await enrollStudent(source.group.id, { parentEmail: uniqEmail('wrongtarget') })
    const target = await makeTarget()
    const otherTarget = await makeTarget()

    const res = await sendEmailCampaign({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      targetCourseId: target.course.id,
      targetGroupIds: [otherTarget.group.id],
      ...CONTENT,
    })
    expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })
  })
})

describe('preporuka selection mode', () => {
  it('selects students by any preporuka filter — specific course or special track — across programs and groups', async () => {
    const admin = await loginAdmin()
    const a = await makeSourceGroup()
    const b = await makeSourceGroup()
    const recommended = await createCourse({ title: 'Ciljani program X' })
    const otherCourse = await createCourse({ title: 'Ciljani program Y' })
    const prep = await enrollStudent(a.group.id, { parentEmail: uniqEmail('prep'), firstName: 'Pero' })
    const program = await enrollStudent(b.group.id, { parentEmail: uniqEmail('prog'), firstName: 'Petra' })
    const course = await enrollStudent(a.group.id, { parentEmail: uniqEmail('crs'), firstName: 'Karlo' })
    const otherRec = await enrollStudent(b.group.id, { parentEmail: uniqEmail('crs2'), firstName: 'Klara' })
    await enrollStudent(a.group.id, { parentEmail: uniqEmail('none'), firstName: 'Nula' })
    await db.studentAssessment.create({
      data: { studentId: prep.id, groupId: a.group.id, authorId: admin.id, recommendationKind: 'COMPETITION_PREP' },
    })
    await db.studentAssessment.create({
      data: { studentId: program.id, groupId: b.group.id, authorId: admin.id, recommendationKind: 'COMPETITION_PROGRAM' },
    })
    await db.studentAssessment.create({
      data: { studentId: course.id, groupId: a.group.id, authorId: admin.id, recommendationKind: 'COURSE', recommendedCourseId: recommended.id },
    })
    await db.studentAssessment.create({
      data: { studentId: otherRec.id, groupId: b.group.id, authorId: admin.id, recommendationKind: 'COURSE', recommendedCourseId: otherCourse.id },
    })

    // The mode is deliberately year-wide, so other tests' assessment-carrying
    // students appear too — assert containment via this test's unique emails.
    const prepOnly = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP'],
    })
    expect(prepOnly.success).toBe(true)
    if (prepOnly.success) {
      const byEmail = new Map(prepOnly.recipients.map((r) => [r.parentEmail, r]))
      expect(byEmail.get(prep.parentEmail!)?.children[0]).toEqual({
        name: `Pero ${prep.lastName}`,
        recommendation: 'Priprema za natjecanja',
      })
      expect(byEmail.has(program.parentEmail!)).toBe(false)
      expect(byEmail.has(course.parentEmail!)).toBe(false)
    }

    // A specific recommended course selects exactly the students recommended
    // THAT course — not other course recommendations, not the tracks.
    const courseOnly = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: [`course:${recommended.id}`],
    })
    expect(courseOnly.success).toBe(true)
    if (courseOnly.success) {
      const byEmail = new Map(courseOnly.recipients.map((r) => [r.parentEmail, r]))
      expect(byEmail.get(course.parentEmail!)?.children[0]).toEqual({
        name: `Karlo ${course.lastName}`,
        recommendation: 'Ciljani program X',
      })
      expect(byEmail.has(otherRec.parentEmail!)).toBe(false)
      expect(byEmail.has(prep.parentEmail!)).toBe(false)
    }

    const mixed = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP', 'COMPETITION_PROGRAM', `course:${otherCourse.id}`],
    })
    expect(mixed.success).toBe(true)
    if (mixed.success) {
      const emails = mixed.recipients.map((r) => r.parentEmail)
      expect(emails).toContain(prep.parentEmail)
      expect(emails).toContain(program.parentEmail)
      expect(emails).toContain(otherRec.parentEmail)
      expect(emails).not.toContain(course.parentEmail)
    }
  })

  it('scopes preporuka cohorts by year and city', async () => {
    const admin = await loginAdmin()
    const current = await makeSourceGroup()
    const otherYearLocation = await createLocation({ city: 'SPLIT' })
    const otherYearGroup = await createGroup({
      courseId: current.course.id,
      locationId: otherYearLocation.id,
      schoolYear: TARGET_YEAR,
      city: 'SPLIT',
      dayOfWeek: 'Petak',
      startTime: '17:00',
      endTime: '18:30',
    })
    const offYearStudent = await createStudent({ parentEmail: uniqEmail('off-year') })
    await createEnrollment(offYearStudent.id, otherYearGroup.id, { schoolYear: TARGET_YEAR })
    await db.studentAssessment.create({
      data: {
        studentId: offYearStudent.id,
        groupId: otherYearGroup.id,
        authorId: admin.id,
        recommendationKind: 'COMPETITION_PREP',
      },
    })

    const preview = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP', 'COMPETITION_PROGRAM'],
    })
    expect(preview.success).toBe(true)
    if (preview.success) {
      const emails = preview.recipients.map((r) => r.parentEmail)
      expect(emails).not.toContain(offYearStudent.parentEmail)
    }

    mockSession({ id: (await createAdmin({ city: 'SIBENIK' })).id, role: 'ADMIN', city: 'SIBENIK' })
    const sibenik = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP', 'COMPETITION_PROGRAM'],
    })
    expect(sibenik.success).toBe(true)
    if (sibenik.success) expect(sibenik.recipients).toHaveLength(0)
  })

  it('sends a preporuka-mode invitation, records the kinds, and shares the idempotency skip-set with group mode', async () => {
    const admin = await loginAdmin()
    const source = await makeSourceGroup()
    const shared = await enrollStudent(source.group.id, { parentEmail: uniqEmail('mode-shared'), firstName: 'Vito' })
    await db.studentAssessment.create({
      data: { studentId: shared.id, groupId: source.group.id, authorId: admin.id, recommendationKind: 'COMPETITION_PREP' },
    })
    const target = await makeTarget()
    const content = { ...CONTENT, targetCourseId: target.course.id, targetGroupIds: [target.group.id] }

    const groupMode = await sendEmailCampaign({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...content,
    })
    expect(groupMode).toMatchObject({ success: true, sent: 1 })

    sendMock.mockClear()
    const recMode = await sendEmailCampaign({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP'],
      ...content,
    })
    // The year-wide cohort may include other tests' PREP students (they get
    // sent — unique target course), but the shared parent must be skipped.
    expect(recMode).toMatchObject({ success: true, alreadySent: 1 })
    expect(sendMock.mock.calls.map((c) => c[0].to)).not.toContain(shared.parentEmail)

    // The audit records display labels, not encoded values.
    const campaign = await db.emailCampaign.findFirst({
      where: { sourceRecommendations: { has: 'Priprema za natjecanja' } },
    })
    expect(campaign).not.toBeNull()
    expect(campaign?.sourceGroupIds).toEqual([])
  })

  it('rejects a request selecting both modes or neither', async () => {
    await loginAdmin()
    const { group } = await makeSourceGroup()

    const both = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      recommendations: ['COMPETITION_PREP'],
    })
    expect(both).toEqual({ success: false, error: 'Odaberite grupe ili preporuku.' })

    const neither = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
    })
    expect(neither).toEqual({ success: false, error: 'Odaberite grupe ili preporuku.' })
  })
})

describe('previewEmailHtml', () => {
  it('renders schedule boxes and the /upisi CTA for the invitation kind', async () => {
    await loginAdmin()
    const target = await makeTarget()

    const res = await previewEmailHtml({
      kind: 'REENROLLMENT',
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.html).toContain('Termini u novoj školskoj godini:')
      expect(res.html).toContain('Četvrtak · 18:30–20:00')
      expect(res.html).toContain('/upisi')
      expect(res.html).toContain(CONTENT.bodyText)
    }
  })

  it('renders neither schedules nor CTA for the custom kind', async () => {
    await loginAdmin()
    const res = await previewEmailHtml({ kind: 'CUSTOM', ...CONTENT })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.html).not.toContain('Termini u novoj školskoj godini:')
      expect(res.html).not.toContain('/upisi')
    }
  })

  it('rejects an invalid target group id', async () => {
    await loginAdmin()
    const target = await makeTarget()
    const res = await previewEmailHtml({
      kind: 'REENROLLMENT',
      targetCourseId: target.course.id,
      targetGroupIds: ['nonexistent'],
      ...CONTENT,
    })
    expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })
  })
})

describe('city scoping', () => {
  it('getEmailGroupTree only lists own-city courses and honours standardOnly', async () => {
    const split = await makeSourceGroup({ city: 'SPLIT' })
    const sibenikStandard = await makeSourceGroup({ city: 'SIBENIK' })
    const sibenikRadionica = await makeSourceGroup({ city: 'SIBENIK', isCustom: true })

    await loginAdmin('SIBENIK')
    const all = await getEmailGroupTree(SOURCE_YEAR, false)
    const allIds = all.map((c) => c.id)
    expect(allIds).toContain(sibenikStandard.course.id)
    expect(allIds).toContain(sibenikRadionica.course.id)
    expect(allIds).not.toContain(split.course.id)

    const standardOnly = await getEmailGroupTree(SOURCE_YEAR, true)
    const standardIds = standardOnly.map((c) => c.id)
    expect(standardIds).toContain(sibenikStandard.course.id)
    expect(standardIds).not.toContain(sibenikRadionica.course.id)
  })

  it('rejects cross-city source groups in preview and send', async () => {
    const split = await makeSourceGroup({ city: 'SPLIT' })
    await enrollStudent(split.group.id, { parentEmail: uniqEmail('split-parent') })

    await loginAdmin('SIBENIK')
    const preview = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [split.group.id],
    })
    expect(preview).toEqual({ success: false, error: 'Nevaljani podaci.' })

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [split.group.id],
      ...CONTENT,
    })
    expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('rejects a smuggled cross-city target group', async () => {
    const sibenikSource = await makeSourceGroup({ city: 'SIBENIK' })
    await enrollStudent(sibenikSource.group.id, {
      parentEmail: uniqEmail('sib-parent'),
      city: 'SIBENIK',
    })
    const splitTarget = await makeTarget('SPLIT')

    await loginAdmin('SIBENIK')
    const res = await sendEmailCampaign({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [sibenikSource.group.id],
      targetCourseId: splitTarget.course.id,
      targetGroupIds: [splitTarget.group.id],
      ...CONTENT,
    })
    expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('getEmailCampaigns never leaks the other city’s history', async () => {
    await loginAdmin('SPLIT')
    const { group } = await makeSourceGroup({ city: 'SPLIT' })
    await enrollStudent(group.id, { parentEmail: uniqEmail('history') })
    const sent = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    expect(sent.success).toBe(true)

    const splitList = await getEmailCampaigns()
    expect(splitList.some((c) => c.sourceGroupIds.includes(group.id))).toBe(true)

    await loginAdmin('SIBENIK')
    const sibenikList = await getEmailCampaigns()
    expect(sibenikList.some((c) => c.sourceGroupIds.includes(group.id))).toBe(false)
  })
})
