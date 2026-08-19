import { describe, expect, it, vi, beforeEach } from 'vitest'
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
import { computeSchoolYear } from '@/lib/school-year'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const YEAR = computeSchoolYear()

const { sendEmailCampaign, getEmailStudentOptions, previewEmailRecipients } = await import(
  '@/actions/admin/email-campaign'
)
const { resetStudentPassword } = await import('@/actions/admin/student')

beforeEach(() => {
  sendMock.mockReset()
  mockedCookies.mockResolvedValue({ get: () => undefined })
})

async function settle(campaignId: string) {
  for (let i = 0; i < 400; i++) {
    const c = await db.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { sentCount: true, failedCount: true, finishedAt: true },
    })
    if (c?.finishedAt) return { sent: c.sentCount, failed: c.failedCount }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`campaign ${campaignId} never finished`)
}

let seq = 0
const uniqEmail = (p: string) =>
  `${p}-${Date.now().toString(36)}${(++seq).toString(36)}@test.hr`

const CONTENT = {
  subject: 'Pristupni podaci – Inovatic',
  bodyText: 'U nastavku se nalaze pristupni podaci za polaznički portal.',
}

async function makeGroup(city: City = 'SPLIT', kind: 'STANDARD' | 'RADIONICA' = 'STANDARD') {
  const location = await createLocation({ city })
  const course = await createCourse({ kind })
  return createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: YEAR,
    city,
    dayOfWeek: 'Utorak',
    startTime: '17:00',
    endTime: '18:30',
  })
}

/** An enrolled child with a usable password, in the given group. */
async function enrolledChild(
  groupId: string,
  opts: { parentEmail?: string; city?: City; plainPassword?: string | null } = {},
) {
  const student = await createStudent({
    city: opts.city ?? 'SPLIT',
    parentEmail: opts.parentEmail ?? uniqEmail('roditelj'),
  })
  await db.user.update({
    where: { id: student.id },
    data: { plainPassword: opts.plainPassword === undefined ? 'pw1234' : opts.plainPassword },
  })
  await createEnrollment(student.id, groupId, { schoolYear: YEAR })
  return student
}

describe('CREDENTIALS campaign — one mail per child', () => {
  it('sends two separate mails to two siblings on one parent address', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const shared = uniqEmail('obitelj')
    const ana = await enrolledChild(group.id, { parentEmail: shared })
    const marko = await enrolledChild(group.id, { parentEmail: shared })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    const done = await settle(res.campaignId)

    // Two rows, two sends — never one merged mail carrying both logins.
    expect(res.total).toBe(2)
    expect(done.sent).toBe(2)

    const rows = await db.emailCampaignRecipient.findMany({
      where: { campaignId: res.campaignId },
      select: { parentEmail: true, studentIds: true, status: true },
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.parentEmail === shared)).toBe(true)
    expect(rows.flatMap((r) => r.studentIds).sort()).toEqual([ana.id, marko.id].sort())
    expect(rows.every((r) => r.studentIds.length === 1)).toBe(true)
  })

  /**
   * The row-level assertions above prove the COHORT is one row per child. This
   * one proves the WIRE is too, which is a different claim: hoisting
   * `credentials` out of `sendToRecipient`'s per-recipient scope would leave
   * those rows byte-identical and still deliver the second child's password to
   * the first mail. That is the classic mail-merge leak the whole design exists
   * to make impossible, so it is asserted on what actually left the building.
   *
   * Needs `RESEND_API_KEY`: `sendTransactionalEmail` returns false on its first
   * line without one, so the resend mock is never reached and every assertion
   * on it passes vacuously.
   */
  it('gives each sibling their OWN login on the wire, not the other one\u2019s', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key'
    process.env.EMAIL_SEND_THROTTLE_MS = '0'
    try {
      const admin = await createAdmin({ city: 'SPLIT' })
      mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
      const group = await makeGroup()
      const shared = uniqEmail('obitelj')
      const ana = await enrolledChild(group.id, { parentEmail: shared })
      const marko = await enrolledChild(group.id, { parentEmail: shared })

      const res = await sendEmailCampaign({
        kind: 'CREDENTIALS',
        ...CONTENT,
        sourceSchoolYear: YEAR,
        sourceGroupIds: [group.id],
      })
      expect(res.success).toBe(true)
      if (!res.success) return
      const done = await settle(res.campaignId)
      expect(done.sent).toBe(2)

      // Positive control: without the key this is 0 and everything below is vacuous.
      expect(sendMock).toHaveBeenCalledTimes(2)

      const accounts = await db.user.findMany({
        where: { id: { in: [ana.id, marko.id] } },
        select: { id: true, firstName: true, username: true, plainPassword: true },
      })
      const byId = new Map(accounts.map((a) => [a.id, a]))

      const sent = sendMock.mock.calls.map(([payload]) => ({
        to: payload.to,
        subject: payload.subject as string,
        username: payload.react?.props?.credentials?.username as string | undefined,
        password: payload.react?.props?.credentials?.password as string | undefined,
      }))

      // Both went to the one shared inbox — that is the whole hazard.
      expect(sent.every((m) => m.to === shared)).toBe(true)

      for (const child of [ana, marko]) {
        const account = byId.get(child.id)
        const mine = sent.find((m) => m.username === account?.username)
        expect(mine, `no mail carried ${account?.username}`).toBeDefined()
        // Its own password, and the subject names its own child.
        expect(mine?.password).toBe(account?.plainPassword)
        expect(mine?.subject).toContain(account?.firstName)
        // And the sibling's credentials are nowhere in it.
        const sibling = byId.get(child.id === ana.id ? marko.id : ana.id)
        expect(mine?.username).not.toBe(sibling?.username)
      }

      // Two DIFFERENT logins left the building, not one repeated twice.
      expect(new Set(sent.map((m) => m.username)).size).toBe(2)
    } finally {
      delete process.env.RESEND_API_KEY
      delete process.env.EMAIL_SEND_THROTTLE_MS
    }
  })

  /**
   * A workshop child gets a real portal account like anyone else — their login
   * works from the workshop until the end of the school year — so a CREDENTIALS
   * campaign must be able to reach them. The radionica exclusion is right for
   * REENROLLMENT (you do not invite a workshop's parents to re-enrol in it) and
   * for EVALUATION (workshops are never graded), and applying it here only hid
   * the group from the composer with no error and no explanation: the families
   * most likely to be forgotten were the ones the campaign could not reach.
   */
  it('reaches a radionica group, which REENROLLMENT and EVALUATION exclude', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const workshop = await makeGroup('SPLIT', 'RADIONICA')
    const child = await enrolledChild(workshop.id)

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [workshop.id],
    })

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.total).toBe(1)
    await settle(res.campaignId)

    const rows = await db.emailCampaignRecipient.findMany({
      where: { campaignId: res.campaignId },
      select: { studentIds: true, status: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].studentIds).toEqual([child.id])
    expect(rows[0].status).toBe('SENT')
  })

  it('sends ONE mail to a child enrolled in two selected groups', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const groupA = await makeGroup()
    const groupB = await makeGroup()
    const child = await enrolledChild(groupA.id)
    await createEnrollment(child.id, groupB.id, { schoolYear: YEAR })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [groupA.id, groupB.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    await settle(res.campaignId)

    // A password is an account fact — two groups must not mean two mails.
    expect(res.total).toBe(1)
  })
})

describe('CREDENTIALS campaign — password minting', () => {
  it('mints a password up front for a child who has none, and mails it', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    // The Excel-import shape: unusable hash, no readable password.
    const child = await enrolledChild(group.id, { plainPassword: null })

    const before = await db.user.findUnique({
      where: { id: child.id },
      select: { plainPassword: true, passwordHash: true },
    })
    expect(before?.plainPassword).toBeNull()

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    const done = await settle(res.campaignId)

    const after = await db.user.findUnique({
      where: { id: child.id },
      select: { plainPassword: true, passwordHash: true, credentialsSentAt: true },
    })
    expect(after?.plainPassword).toBeTruthy()
    expect(after?.passwordHash).not.toBe(before?.passwordHash)
    expect(after?.credentialsSentAt).not.toBeNull()
    expect(done.sent).toBe(1)
  })

  it('leaves an existing password alone — a parent handed it in person keeps it', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const child = await enrolledChild(group.id, { plainPassword: 'keepme' })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error('send failed')
    await settle(res.campaignId)

    const after = await db.user.findUnique({
      where: { id: child.id },
      select: { plainPassword: true },
    })
    expect(after?.plainPassword).toBe('keepme')
  })

  /**
   * The reason minting happens at campaign creation rather than in the send
   * loop: a resumed run must not rotate a password the first run already mailed.
   */
  it('a resumed run does not rotate the password a second time', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const child = await enrolledChild(group.id, { plainPassword: null })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error('send failed')
    await settle(res.campaignId)

    const minted = await db.user.findUnique({
      where: { id: child.id },
      select: { plainPassword: true },
    })

    const { resumeEmailCampaign } = await import('@/actions/admin/email-campaign')
    await resumeEmailCampaign(res.campaignId)

    const after = await db.user.findUnique({
      where: { id: child.id },
      select: { plainPassword: true },
    })
    expect(after?.plainPassword).toBe(minted?.plainPassword)
  })
})

describe('CREDENTIALS campaign — the ownership guard', () => {
  it('fails closed when the parent address changed after the cohort was written', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const child = await enrolledChild(group.id)

    // Resolve the cohort, then move the goalposts before the send runs.
    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error('send failed')
    await settle(res.campaignId)

    // Now the same campaign is resumed after an address change — a fresh row is
    // needed to exercise the guard, so re-pend the row and change the address.
    await db.emailCampaignRecipient.updateMany({
      where: { campaignId: res.campaignId },
      data: { status: 'PENDING', sentKey: null },
    })
    await db.user.update({
      where: { id: child.id },
      data: { parentEmail: uniqEmail('promijenjena') },
    })

    const { resumeEmailCampaign } = await import('@/actions/admin/email-campaign')
    await resumeEmailCampaign(res.campaignId)
    await settle(res.campaignId)

    const row = await db.emailCampaignRecipient.findFirst({
      where: { campaignId: res.campaignId },
      select: { status: true, failureReason: true },
    })
    expect(row?.status).toBe('FAILED')
    expect(row?.failureReason).toMatch(/adresa roditelja se promijenila/i)
  })

  it('skips a child whose parent has no address, by name', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const student = await createStudent({ city: 'SPLIT', parentEmail: null })
    await createEnrollment(student.id, group.id, { schoolYear: YEAR })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return

    const skippedRow = await db.emailCampaignRecipient.findFirst({
      where: { campaignId: res.campaignId, status: 'SKIPPED' },
      select: { childNames: true },
    })
    expect(skippedRow?.childNames[0]).toContain(student.lastName)
  })
})

describe('CREDENTIALS campaign — cohort selection', () => {
  it('accepts individually named children', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const picked = await enrolledChild(group.id)
    await enrolledChild(group.id) // not picked

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceStudentIds: [picked.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    await settle(res.campaignId)

    expect(res.total).toBe(1)
    const campaign = await db.emailCampaign.findUnique({
      where: { id: res.campaignId },
      select: { sourceStudentIds: true },
    })
    expect(campaign?.sourceStudentIds).toEqual([picked.id])
  })

  it('rejects a child from the other city', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const sibenikGroup = await makeGroup('SIBENIK')
    const sibenikChild = await enrolledChild(sibenikGroup.id, { city: 'SIBENIK' })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceStudentIds: [sibenikChild.id],
    })
    expect(res.success).toBe(false)
  })

  it('rejects a preporuka cohort — it names children, not accounts', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      recommendations: ['COMPETITION_PREP'],
    })
    expect(res.success).toBe(false)
  })

  it('rejects individually named children for a non-CREDENTIALS kind', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const child = await enrolledChild(group.id)

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceStudentIds: [child.id],
    })
    expect(res.success).toBe(false)
  })

  it('excludes by student id, leaving a sibling on the same address intact', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const shared = uniqEmail('obitelj')
    const ana = await enrolledChild(group.id, { parentEmail: shared })
    const marko = await enrolledChild(group.id, { parentEmail: shared })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
      excludedStudentIds: [ana.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    await settle(res.campaignId)

    // Excluding one child must not take their sibling with them.
    expect(res.total).toBe(1)
    const rows = await db.emailCampaignRecipient.findMany({
      where: { campaignId: res.campaignId, status: 'SENT' },
      select: { studentIds: true },
    })
    expect(rows.flatMap((r) => r.studentIds)).toEqual([marko.id])
  })
})

describe('credentialsSentAt bookkeeping', () => {
  it('is cleared by resetStudentPassword — a rotated password was never mailed', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const child = await enrolledChild(group.id)

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error('send failed')
    await settle(res.campaignId)

    expect(
      (await db.user.findUnique({ where: { id: child.id }, select: { credentialsSentAt: true } }))
        ?.credentialsSentAt,
    ).not.toBeNull()

    await resetStudentPassword(child.id)

    expect(
      (await db.user.findUnique({ where: { id: child.id }, select: { credentialsSentAt: true } }))
        ?.credentialsSentAt,
    ).toBeNull()
  })

  it('getEmailStudentOptions reports who needs a password and who was already sent', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    const needsPw = await enrolledChild(group.id, { plainPassword: null })
    const noEmail = await createStudent({ city: 'SPLIT', parentEmail: null })
    await createEnrollment(noEmail.id, group.id, { schoolYear: YEAR })

    const options = await getEmailStudentOptions(YEAR)
    const byId = new Map(options.map((o) => [o.id, o]))

    expect(byId.get(needsPw.id)?.needsPassword).toBe(true)
    expect(byId.get(needsPw.id)?.alreadySent).toBe(false)
    expect(byId.get(noEmail.id)?.hasEmail).toBe(false)
  })

  it('previewEmailRecipients resolves a credentials cohort without sending', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const group = await makeGroup()
    await enrolledChild(group.id)

    const res = await previewEmailRecipients({
      kind: 'CREDENTIALS',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (res.success) expect(res.recipients).toHaveLength(1)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
