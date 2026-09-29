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
  createParent,
  createStudent,
  linkToParent,
} from './helpers/factory'
import { inspectPasswordToken } from '@/lib/password-token'
import type { PasswordLinkCard } from '@/lib/credentials-email-recipients'
import { computeSchoolYear } from '@/lib/school-year'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

type ResendPayload = { to: string; subject: string; react: { props: Record<string, unknown> } }

// Admin copies (`[Kopija] …`, one per city admin per campaign) go to their own
// mock, so every parent-send count below stays about parents.
const { sendMock, adminCopyMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  adminCopyMock: vi.fn<(p: ResendPayload) => Promise<unknown>>(async () => ({
    data: { id: 'copy' },
    error: null,
  })),
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: (p: ResendPayload) =>
        p.subject?.startsWith('[Kopija] ') ? adminCopyMock(p) : sendMock(p),
    }
  },
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const YEAR = computeSchoolYear()

const { sendEmailCampaign, getEmailStudentOptions, previewEmailRecipients } = await import(
  '@/actions/admin/email-campaign'
)

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
  subject: 'Pristup portalu – postavite lozinku',
  bodyText: 'Prijavljujete se svojim e-mailom, a lozinku postavljate sami.',
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

/** A parent login with the given children-to-be. */
async function parentLogin(city: City = 'SPLIT', email = uniqEmail('roditelj')) {
  return createParent({ city, email })
}

/** An enrolled child in the given group, linked to `parentId` (or to none). */
async function enrolledChild(
  groupId: string,
  opts: { parentId?: string | null; city?: City } = {},
) {
  const student = await createStudent({ city: opts.city ?? 'SPLIT', parentEmail: uniqEmail('stari') })
  if (opts.parentId !== null) {
    const parentId = opts.parentId ?? (await parentLogin(opts.city ?? 'SPLIT')).id
    await linkToParent(student.id, parentId)
  }
  await createEnrollment(student.id, groupId, { schoolYear: YEAR })
  return student
}

async function asAdmin(city: City = 'SPLIT') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
}

/** Runs `fn` with a Resend key set, so the mock actually receives the mails. */
async function withMailKey<T>(fn: () => Promise<T>): Promise<T> {
  process.env.RESEND_API_KEY = 'test_resend_key'
  process.env.EMAIL_SEND_THROTTLE_MS = '0'
  sendMock.mockResolvedValue({ data: { id: 'sent' }, error: null })
  try {
    return await fn()
  } finally {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_SEND_THROTTLE_MS
  }
}

function linkOf(payload: ResendPayload): PasswordLinkCard {
  return (payload.react.props as { passwordLink: PasswordLinkCard }).passwordLink
}

describe('setup-link campaign — one mail per parent LOGIN', () => {
  it('sends siblings on one login ONE mail listing both, with a working link', async () => {
    await asAdmin()
    const group = await makeGroup()
    const parent = await parentLogin()
    const ana = await enrolledChild(group.id, { parentId: parent.id })
    const marko = await enrolledChild(group.id, { parentId: parent.id })

    await withMailKey(async () => {
      const res = await sendEmailCampaign({
        kind: 'CREDENTIALS',
        ...CONTENT,
        sourceSchoolYear: YEAR,
        sourceGroupIds: [group.id],
      })
      if (!res.success) throw new Error(res.error)
      expect(res.total).toBe(1)
      await settle(res.campaignId)

      const row = await db.emailCampaignRecipient.findFirstOrThrow({
        where: { campaignId: res.campaignId },
        select: { parentEmail: true, studentIds: true, status: true },
      })
      expect(row.parentEmail).toBe(parent.email)
      expect(row.studentIds.sort()).toEqual([ana.id, marko.id].sort())
      expect(row.status).toBe('SENT')

      const sent = sendMock.mock.calls.map(([p]) => p as ResendPayload)
      expect(sent).toHaveLength(1)
      expect(sent[0].to).toBe(parent.email)
      const link = linkOf(sent[0])
      expect(link.children).toHaveLength(2)

      // The link on the wire opens exactly this login — and the database holds
      // only its hash.
      const token = link.url.split('#')[1]
      const state = await inspectPasswordToken(token)
      expect(state.ok && state.account.email).toBe(parent.email)
      expect(await db.passwordToken.count({ where: { tokenHash: token } })).toBe(0)
    })
  })

  it('sends two logins two separate mails, each with its own link', async () => {
    await asAdmin()
    const group = await makeGroup()
    const a = await enrolledChild(group.id)
    const b = await enrolledChild(group.id)

    await withMailKey(async () => {
      const res = await sendEmailCampaign({
        kind: 'CREDENTIALS',
        ...CONTENT,
        sourceSchoolYear: YEAR,
        sourceGroupIds: [group.id],
      })
      if (!res.success) throw new Error(res.error)
      await settle(res.campaignId)

      const sent = sendMock.mock.calls.map(([p]) => p as ResendPayload)
      expect(sent).toHaveLength(2)
      const urls = sent.map((p) => linkOf(p).url)
      expect(new Set(urls).size).toBe(2)
      for (const p of sent) {
        const state = await inspectPasswordToken(linkOf(p).url.split('#')[1])
        expect(state.ok && state.account.email).toBe(p.to)
      }
      expect([a.id, b.id]).toHaveLength(2)
    })
  })

  it('reaches a radionica group, which REENROLLMENT and EVALUATION exclude', async () => {
    await asAdmin()
    const group = await makeGroup('SPLIT', 'RADIONICA')
    await enrolledChild(group.id)

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (res.success) expect(res.total).toBe(1)
  })

  it('lists a child enrolled in two selected groups once', async () => {
    await asAdmin()
    const g1 = await makeGroup()
    const g2 = await makeGroup()
    const child = await enrolledChild(g1.id)
    await createEnrollment(child.id, g2.id, { schoolYear: YEAR })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [g1.id, g2.id],
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)
    const row = await db.emailCampaignRecipient.findFirstOrThrow({
      where: { campaignId: res.campaignId },
      select: { studentIds: true },
    })
    expect(row.studentIds).toEqual([child.id])
  })

  it('sends to a family that already chose a password, and leaves that password alone', async () => {
    await asAdmin()
    const group = await makeGroup()
    const parent = await parentLogin()
    await db.user.update({ where: { id: parent.id }, data: { passwordSetAt: new Date() } })
    await enrolledChild(group.id, { parentId: parent.id })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error(res.error)
    expect(res.total).toBe(1)
    await settle(res.campaignId)

    const after = await db.user.findUniqueOrThrow({ where: { id: parent.id } })
    expect(after.passwordHash).toBe(parent.passwordHash)
    expect(after.plainPassword).toBeNull()
  })
})

describe('setup-link campaign — the ownership guard', () => {
  it('fails closed, and mints nothing, when a child moved to the other parent after the cohort was written', async () => {
    await asAdmin()
    const group = await makeGroup()
    const mother = await parentLogin()
    const child = await enrolledChild(group.id, { parentId: mother.id })
    const father = await parentLogin()

    // Write the cohort (the mother's row) and let the first run finish.
    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceStudentIds: [child.id],
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)

    // Put the row back to "still owed", move the child, and resume — the
    // deterministic way to land between cohort and send.
    await db.emailCampaignRecipient.updateMany({
      where: { campaignId: res.campaignId },
      data: { status: 'PENDING' },
    })
    await db.emailCampaign.update({
      where: { id: res.campaignId },
      data: { finishedAt: null },
    })
    await db.passwordToken.deleteMany({ where: { userId: mother.id } })
    await linkToParent(child.id, father.id)

    const { resumeEmailCampaign } = await import('@/actions/admin/email-campaign')
    await withMailKey(async () => {
      await resumeEmailCampaign(res.campaignId)
      await settle(res.campaignId)
    })

    const row = await db.emailCampaignRecipient.findFirstOrThrow({
      where: { campaignId: res.campaignId },
      select: { status: true, failureReason: true },
    })
    expect(row.status).toBe('FAILED')
    expect(row.failureReason).toMatch(/drugim roditeljskim računom/)
    expect(sendMock).not.toHaveBeenCalled()
    expect(await db.passwordToken.count({ where: { userId: { in: [mother.id, father.id] } } })).toBe(0)
  })

  it('skips — by name — a child who has no parent login', async () => {
    await asAdmin()
    const group = await makeGroup()
    const orphan = await enrolledChild(group.id, { parentId: null })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error(res.error)
    expect(res.total).toBe(0)
    const skipped = await db.emailCampaignRecipient.findFirstOrThrow({
      where: { campaignId: res.campaignId, status: 'SKIPPED' },
      select: { childNames: true, failureReason: true },
    })
    expect(skipped.childNames[0]).toContain(orphan.lastName)
    expect(skipped.failureReason).toMatch(/roditeljski račun/)
  })
})

describe('setup-link campaign — cohort selection', () => {
  it('accepts individually named children', async () => {
    await asAdmin()
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
  })

  it('rejects a child from the other city', async () => {
    await asAdmin()
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

  it('rejects a preporuka cohort', async () => {
    await asAdmin()
    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      recommendations: ['COMPETITION_PREP'],
    })
    expect(res.success).toBe(false)
  })

  it('rejects individually named children for a non-CREDENTIALS kind', async () => {
    await asAdmin()
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

  it('excludes a whole login by its address', async () => {
    await asAdmin()
    const group = await makeGroup()
    const kept = await parentLogin()
    const dropped = await parentLogin()
    await enrolledChild(group.id, { parentId: kept.id })
    await enrolledChild(group.id, { parentId: dropped.id })

    const res = await sendEmailCampaign({
      kind: 'CREDENTIALS',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
      excludedParentEmails: [dropped.email],
    })
    if (!res.success) throw new Error(res.error)
    expect(res.total).toBe(1)
    await settle(res.campaignId)
    const rows = await db.emailCampaignRecipient.findMany({
      where: { campaignId: res.campaignId, status: { in: ['SENT', 'PENDING'] } },
      select: { parentEmail: true },
    })
    expect(rows.map((r) => r.parentEmail)).toEqual([kept.email])
  })
})

describe('link bookkeeping', () => {
  it('stamps credentialsSentAt on the parent LOGIN after a delivered mail', async () => {
    await asAdmin()
    const group = await makeGroup()
    const parent = await parentLogin()
    await enrolledChild(group.id, { parentId: parent.id })

    await withMailKey(async () => {
      const res = await sendEmailCampaign({
        kind: 'CREDENTIALS',
        ...CONTENT,
        sourceSchoolYear: YEAR,
        sourceGroupIds: [group.id],
      })
      if (!res.success) throw new Error(res.error)
      await settle(res.campaignId)
    })

    const after = await db.user.findUniqueOrThrow({
      where: { id: parent.id },
      select: { credentialsSentAt: true },
    })
    expect(after.credentialsSentAt).not.toBeNull()
  })

  it('getEmailStudentOptions reports the login state per child', async () => {
    await asAdmin()
    const group = await makeGroup()
    const withSet = await parentLogin()
    await db.user.update({ where: { id: withSet.id }, data: { passwordSetAt: new Date() } })
    const set = await enrolledChild(group.id, { parentId: withSet.id })
    const none = await enrolledChild(group.id, { parentId: null })

    const options = await getEmailStudentOptions(YEAR)
    const byId = new Map(options.map((o) => [o.id, o]))

    expect(byId.get(set.id)).toMatchObject({ hasAccount: true, passwordSet: true, alreadySent: false })
    expect(byId.get(none.id)?.hasAccount).toBe(false)
  })

  it('previewEmailRecipients resolves a cohort without sending or minting', async () => {
    await asAdmin()
    const group = await makeGroup()
    const parent = await parentLogin()
    await enrolledChild(group.id, { parentId: parent.id })

    const res = await previewEmailRecipients({
      kind: 'CREDENTIALS',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (res.success) expect(res.recipients).toHaveLength(1)
    expect(sendMock).not.toHaveBeenCalled()
    expect(await db.passwordToken.count({ where: { userId: parent.id } })).toBe(0)
  })
})
