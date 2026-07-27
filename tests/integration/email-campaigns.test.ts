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
  getCampaignDetail,
  getCampaignProgress,
  resumeEmailCampaign,
} = await import('@/actions/admin/email-campaign')

/**
 * The send now runs detached from the request so the admin can close the tab,
 * which means a test has to wait for the campaign to finish before asserting on
 * what actually went out. With no RESEND_API_KEY there is no throttle, so this
 * settles almost immediately.
 */
async function settle(campaignId: string) {
  for (let i = 0; i < 400; i++) {
    const c = await db.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { sentCount: true, failedCount: true, finishedAt: true },
    })
    if (c?.finishedAt) {
      const failedRows = await db.emailCampaignRecipient.findMany({
        where: { campaignId, status: 'FAILED' },
        select: { parentEmail: true },
      })
      return { sent: c.sentCount, failed: failedRows.map((r) => r.parentEmail) }
    }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`campaign ${campaignId} never finished`)
}

/** Start a send and wait for it, flattened into the old synchronous shape. */
async function sendAndSettle(input: Parameters<typeof sendEmailCampaign>[0]) {
  const res = await sendEmailCampaign(input)
  if (!res.success) return res
  const done = await settle(res.campaignId)
  return { ...res, ...done }
}

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
  // ...but skip the 2 req/s throttle: the SDK is mocked, so it is dead time
  // that would also leave background jobs running into the next test file.
  process.env.EMAIL_SEND_THROTTLE_MS = '0'
  await db.schoolYear.upsert({ where: { label: TARGET_YEAR }, update: {}, create: { label: TARGET_YEAR } })
  await db.schoolYear.upsert({ where: { label: ARCHIVED_YEAR }, update: {}, create: { label: ARCHIVED_YEAR } })
})

afterAll(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_SEND_THROTTLE_MS
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

    const res = await sendAndSettle({
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

    const first = await sendAndSettle(input)
    const second = await sendAndSettle(input)

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

    const res = await sendAndSettle({
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

    const res = await sendAndSettle({
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

    const res = await sendAndSettle({
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

    const res = await sendAndSettle({
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

    const res = await sendAndSettle({
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

    const first = await sendAndSettle(input)
    expect(first).toMatchObject({ success: true, sent: 2, alreadySent: 0 })

    sendMock.mockClear()
    const second = await sendAndSettle(input)
    expect(second).toMatchObject({ success: true, sent: 0, alreadySent: 2 })
    expect(sendMock).not.toHaveBeenCalled()

    // A different source cohort containing p1 still skips them for this target.
    const otherSource = await makeSourceGroup()
    await enrollStudent(otherSource.group.id, { parentEmail: p1 })
    const third = await sendAndSettle({
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
    const first = await sendAndSettle(input)
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
    const second = await sendAndSettle(input)
    expect(second).toMatchObject({ success: true, sent: 1, alreadySent: 1, failed: [] })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].to).toBe(failing)
  })

  // The pre-flight `loadAlreadyInvited` read cannot stop two sends that both
  // start before either has written a row — only the (sentKey, parentEmail)
  // unique index can. This is the case the old snapshot approach let through.
  it('mails each parent once when two identical sends overlap', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    const p1 = uniqEmail('race-a')
    const p2 = uniqEmail('race-b')
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

    sendMock.mockClear()
    // Both sends start before either has written a row — the exact interleaving
    // the old pre-flight snapshot could not defend against.
    const [a, b] = await Promise.all([sendEmailCampaign(input), sendEmailCampaign(input)])
    expect(a.success && b.success).toBe(true)
    if (!a.success || !b.success) throw new Error('send did not start')
    const [ra, rb] = await Promise.all([settle(a.campaignId), settle(b.campaignId)])

    expect(ra.sent + rb.sent, 'each parent is mailed exactly once across both sends').toBe(2)
    expect(sendMock).toHaveBeenCalledTimes(2)

    const mailed = sendMock.mock.calls.map((c) => c[0].to).sort()
    expect(mailed).toEqual([p1, p2].sort())

    // And exactly one keyed row survives per parent — the loser of each race
    // lost its insert on the unique index rather than sending.
    const keyed = await db.emailCampaignRecipient.findMany({
      where: { parentEmail: { in: [p1, p2] }, sentKey: { not: null } },
      select: { parentEmail: true },
    })
    expect(keyed).toHaveLength(2)
  })

  it('keeps counts accurate per recipient rather than only at the end', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    await enrollStudent(source.group.id, { parentEmail: uniqEmail('count-a') })
    await enrollStudent(source.group.id, { parentEmail: uniqEmail('count-b') })
    const target = await makeTarget()

    sendMock.mockClear()
    const res = await sendAndSettle({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    })
    expect(res).toMatchObject({ success: true, sent: 2 })

    const campaign = await db.emailCampaign.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { sentCount: true, failedCount: true },
    })
    expect(campaign).toMatchObject({ sentCount: 2, failedCount: 0 })
  })

  // CUSTOM is deliberately repeatable, so its rows must never be keyed —
  // otherwise the second newsletter to the same parent would be swallowed.
  it('lets a CUSTOM campaign reach the same parent twice', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    const parent = uniqEmail('custom-twice')
    await enrollStudent(source.group.id, { parentEmail: parent })
    const input = {
      kind: 'CUSTOM' as const,
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...CONTENT,
    }

    sendMock.mockClear()
    expect(await sendAndSettle(input)).toMatchObject({ success: true, sent: 1 })
    expect(await sendAndSettle(input)).toMatchObject({ success: true, sent: 1, alreadySent: 0 })
    expect(sendMock).toHaveBeenCalledTimes(2)

    const keyed = await db.emailCampaignRecipient.count({
      where: { parentEmail: parent, sentKey: { not: null } },
    })
    expect(keyed, 'CUSTOM rows stay unkeyed so they never block each other').toBe(0)
  })

  // The whole point of the detail page: answering "did this child's parent
  // actually get the mail?" — including the children nobody could mail at all.
  it('lists every recipient by child name, and names the children with no e-mail', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    const mailed = uniqEmail('detail-ok')
    await enrollStudent(source.group.id, {
      parentEmail: mailed,
      firstName: 'Ivo',
      lastName: 'Primljeni',
    })
    await enrollStudent(source.group.id, {
      parentEmail: null,
      firstName: 'Ana',
      lastName: 'BezMaila',
    })

    const res = await sendAndSettle({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...CONTENT,
    })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error('send failed')

    const detail = await getCampaignDetail(res.campaignId)
    expect(detail.recipients).toHaveLength(2)

    const sentRow = detail.recipients.find((r) => r.status === 'SENT')
    expect(sentRow?.parentEmail).toBe(mailed)
    expect(sentRow?.childNames).toEqual(['Ivo Primljeni'])

    const skippedRow = detail.recipients.find((r) => r.status === 'SKIPPED')
    expect(skippedRow?.childNames, 'the un-mailable child is named, not just counted').toEqual([
      'Ana BezMaila',
    ])
    expect(skippedRow?.failureReason).toMatch(/nema upisanu e-mail/)
  })

  it('records why a send failed on the recipient row', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    await enrollStudent(source.group.id, { parentEmail: uniqEmail('why-failed') })

    sendMock.mockRejectedValueOnce(new Error('mailbox full'))
    const res = await sendAndSettle({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error('send failed')

    const detail = await getCampaignDetail(res.campaignId)
    const failedRow = detail.recipients.find((r) => r.status === 'FAILED')
    expect(failedRow?.failureReason).toContain('mailbox full')
  })

  it('reports progress and closes the campaign out when the send finishes', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    await enrollStudent(source.group.id, { parentEmail: uniqEmail('progress') })

    const started = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...CONTENT,
    })
    if (!started.success) throw new Error('send did not start')
    expect(started.total).toBe(1)

    await settle(started.campaignId)
    const progress = await getCampaignProgress(started.campaignId)
    expect(progress).toMatchObject({ sentCount: 1, failedCount: 0, totalCount: 1, finished: true })
  })

  // A deploy mid-send leaves PENDING rows. Resuming must finish those and only
  // those — the parents already mailed must not be mailed twice.
  it('resumes an interrupted campaign without re-mailing anyone', async () => {
    await loginAdmin()
    const source = await makeSourceGroup()
    const done = uniqEmail('resume-done')
    const left = uniqEmail('resume-left')
    await enrollStudent(source.group.id, { parentEmail: done })
    await enrollStudent(source.group.id, { parentEmail: left })

    const res = await sendAndSettle({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error('send failed')

    // Simulate a run killed after one recipient: put the other back to PENDING.
    await db.emailCampaignRecipient.updateMany({
      where: { campaignId: res.campaignId, parentEmail: left },
      data: { status: 'PENDING', sentKey: null },
    })
    await db.emailCampaign.update({
      where: { id: res.campaignId },
      data: { sentCount: 1, finishedAt: null },
    })

    sendMock.mockClear()
    const resumed = await resumeEmailCampaign(res.campaignId)
    expect(resumed).toMatchObject({ success: true, remaining: 1 })
    await settle(res.campaignId)

    expect(sendMock, 'only the parent still owed an e-mail is mailed').toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].to).toBe(left)

    const detail = await getCampaignDetail(res.campaignId)
    expect(detail.recipients.filter((r) => r.status === 'SENT')).toHaveLength(2)
    expect(detail.finished).toBe(true)
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

    const res = await sendAndSettle({
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

    const res = await sendAndSettle({
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

    const groupMode = await sendAndSettle({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [source.group.id],
      ...content,
    })
    expect(groupMode).toMatchObject({ success: true, sent: 1 })

    sendMock.mockClear()
    const recMode = await sendAndSettle({
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

  // `recommendations` comes straight from the client and the validator only
  // checks that each value decodes — which any `course:<cuid>` does, including
  // another city's radionica. The cohort query is city-scoped so no student
  // leaks, but the audit row used to store the smuggled course's TITLE and
  // render it in Povijest slanja: an unscoped tenant read.
  it('drops a smuggled cross-city course id instead of labelling it in the audit', async () => {
    const admin = await loginAdmin('SPLIT')
    const source = await makeSourceGroup()
    const foreign = await createCourse({
      title: 'Šibenska radionica – tajni naziv',
      isCustom: true,
      city: 'SIBENIK',
    })
    const student = await enrollStudent(source.group.id, {
      parentEmail: uniqEmail('xcity'),
      firstName: 'Pero',
    })
    await db.studentAssessment.create({
      data: {
        studentId: student.id,
        groupId: source.group.id,
        authorId: admin.id,
        recommendationKind: 'COMPETITION_PREP',
      },
    })

    const target = await makeTarget()
    const res = await sendAndSettle({
      kind: 'REENROLLMENT',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP', `course:${foreign.id}`],
      targetCourseId: target.course.id,
      targetGroupIds: [target.group.id],
      ...CONTENT,
    })
    expect(res.success).toBe(true)
    if (!res.success) return

    const campaign = await db.emailCampaign.findUnique({ where: { id: res.campaignId } })
    // The legitimate half is still labelled…
    expect(campaign?.sourceRecommendations).toContain('Priprema za natjecanja')
    // …and the foreign title never reaches the row, under any label.
    expect(campaign?.sourceRecommendations.join(' ')).not.toMatch(/tajni naziv/i)
    expect(campaign?.sourceRecommendations).toHaveLength(1)
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

    const res = await sendAndSettle({
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
    const res = await sendAndSettle({
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
    const sent = await sendAndSettle({
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
