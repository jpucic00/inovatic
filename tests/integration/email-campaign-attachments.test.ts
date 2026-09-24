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
  createTeacher,
} from './helpers/factory'
import { computeSchoolYear } from '@/lib/school-year'
import { DRAFT_ATTACHMENT_TTL_MS, MAX_ATTACHMENT_BYTES } from '@/lib/email-attachment-rules'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

type ResendAttachment = { filename: string; contentType: string; content: string }
type ResendPayload = {
  to: string
  subject: string
  attachments?: ResendAttachment[]
  react: { props: Record<string, unknown> }
}

// Same split as email-campaigns.test.ts: admin copies go to their own mock so
// parent counts stay about parents.
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

const SOURCE_YEAR = computeSchoolYear()

const {
  getCampaignDetail,
  getCampaignEmailHtml,
  previewEmailHtml,
  resumeEmailCampaign,
  sendEmailCampaign,
} = await import('@/actions/admin/email-campaign')
const { deleteDraftEmailAttachment } = await import('@/actions/admin/email-attachment')
const { POST: uploadPOST } = await import('@/app/api/upload/email-attachment/route')
const { GET: downloadGET } = await import('@/app/api/admin/email-attachment/[attachmentId]/route')

const PDF_BYTES = Buffer.from('%PDF-1.4\n% Ugovor o pohađanju\n%%EOF\n')
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49])

let seq = 0
const uniqEmail = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}@test.hr`

const CONTENT = {
  subject: 'Ugovor za novu godinu',
  bodyText: 'U privitku vam šaljemo ugovor o pohađanju za novu školsku godinu.',
}

async function upload(file: File) {
  const form = new FormData()
  form.append('file', file)
  const req = new Request('http://localhost/api/upload/email-attachment', {
    method: 'POST',
    body: form,
  })
  return uploadPOST(req)
}

async function uploadPdf(name = 'Ugovor 2026.pdf'): Promise<string> {
  const res = await upload(new File([PDF_BYTES], name, { type: 'application/pdf' }))
  expect(res.status).toBe(200)
  const json = (await res.json()) as { id: string }
  return json.id
}

/** A draft written straight to the DB — for sizes the route would refuse. */
async function createDraft(city: City, bytes: number, createdAt?: Date) {
  return db.emailAttachment.create({
    data: {
      city,
      filename: `draft-${++seq}.pdf`,
      mimeType: 'application/pdf',
      bytes,
      createdAt,
      content: { create: { data: PDF_BYTES } },
    },
  })
}

async function loginAdmin(city: City = 'SPLIT') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
}

async function makeCohort(parentEmails: string[], city: City = 'SPLIT') {
  const location = await createLocation({ city })
  const course = await createCourse({ kind: 'STANDARD' })
  const group = await createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: SOURCE_YEAR,
    city,
  })
  for (const parentEmail of parentEmails) {
    const student = await createStudent({ parentEmail, city })
    await createEnrollment(student.id, group.id, { schoolYear: SOURCE_YEAR })
  }
  return group
}

async function settle(campaignId: string) {
  for (let i = 0; i < 400; i++) {
    const c = await db.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { finishedAt: true },
    })
    if (c?.finishedAt) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`campaign ${campaignId} never finished`)
}

beforeAll(() => {
  process.env.RESEND_API_KEY = 'test_resend_key'
  process.env.EMAIL_SEND_THROTTLE_MS = '0'
})

afterAll(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_SEND_THROTTLE_MS
})

beforeEach(() => {
  adminCopyMock.mockClear()
  sendMock.mockReset()
  sendMock.mockResolvedValue({ data: { id: 'sent' }, error: null })
  mockedCookies.mockResolvedValue({ get: () => undefined })
})

describe('POST /api/upload/email-attachment', () => {
  it('stores an admin PDF as a draft in the admin city', async () => {
    await loginAdmin('SIBENIK')
    const res = await upload(new File([PDF_BYTES], 'Ugovor – Šibenik.pdf', { type: 'application/pdf' }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { id: string; filename: string; bytes: number }
    expect(json).toMatchObject({ filename: 'Ugovor – Šibenik.pdf', bytes: PDF_BYTES.length })

    const row = await db.emailAttachment.findUniqueOrThrow({
      where: { id: json.id },
      include: { content: true },
    })
    expect(row.city).toBe('SIBENIK')
    expect(row.campaignId).toBeNull()
    expect(Buffer.from(row.content!.data).equals(PDF_BYTES)).toBe(true)
  })

  it('falls back to the extension when the browser sends no type', async () => {
    await loginAdmin()
    const res = await upload(new File([PDF_BYTES], 'ugovor.pdf', { type: '' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ mimeType: 'application/pdf' })
  })

  it('refuses a guest and a teacher', async () => {
    mockSession(null)
    expect((await upload(new File([PDF_BYTES], 'a.pdf', { type: 'application/pdf' }))).status).toBe(401)
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    expect((await upload(new File([PDF_BYTES], 'a.pdf', { type: 'application/pdf' }))).status).toBe(401)
  })

  it('refuses a disallowed type, a disguised file and an oversized one', async () => {
    await loginAdmin()
    const exe = await upload(new File([Buffer.from('MZ-not-a-document-at-all')], 'x.exe', { type: 'application/x-msdownload' }))
    expect(exe.status).toBe(415)

    // A PNG claiming to be a PDF.
    const disguised = await upload(new File([PNG_BYTES], 'ugovor.pdf', { type: 'application/pdf' }))
    expect(disguised.status).toBe(415)

    const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
    PDF_BYTES.copy(big)
    const oversized = await upload(new File([big], 'veliki.pdf', { type: 'application/pdf' }))
    expect(oversized.status).toBe(413)
  })

  it('sweeps drafts older than a day, never a sent attachment', async () => {
    const admin = await loginAdmin()
    const old = new Date(Date.now() - DRAFT_ATTACHMENT_TTL_MS - 60_000)
    const staleDraft = await createDraft('SPLIT', 100, old)
    const freshDraft = await createDraft('SPLIT', 100)
    const campaign = await db.emailCampaign.create({
      data: {
        city: 'SPLIT',
        kind: 'CUSTOM',
        sourceSchoolYear: SOURCE_YEAR,
        sourceGroupIds: [],
        subject: 'Stara kampanja',
        bodyText: 'Stara poruka s privitkom.',
        sentById: admin.id,
      },
    })
    const sentOld = await createDraft('SPLIT', 100, old)
    await db.emailAttachment.update({ where: { id: sentOld.id }, data: { campaignId: campaign.id } })

    await uploadPdf()

    expect(await db.emailAttachment.findUnique({ where: { id: staleDraft.id } })).toBeNull()
    expect(
      await db.emailAttachmentContent.findUnique({ where: { attachmentId: staleDraft.id } }),
      'the bytes go with the row',
    ).toBeNull()
    expect(await db.emailAttachment.findUnique({ where: { id: freshDraft.id } })).not.toBeNull()
    expect(await db.emailAttachment.findUnique({ where: { id: sentOld.id } })).not.toBeNull()
  })
})

describe('sendEmailCampaign — attachments', () => {
  it('mails every parent and the admin copy the same files, listed under Prilozi', async () => {
    await loginAdmin()
    const a = uniqEmail('att-a')
    const b = uniqEmail('att-b')
    const group = await makeCohort([a, b])
    const pdfId = await uploadPdf('Ugovor.pdf')

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: [pdfId],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)

    expect(sendMock).toHaveBeenCalledTimes(2)
    const expected = [
      { filename: 'Ugovor.pdf', contentType: 'application/pdf', content: PDF_BYTES.toString('base64') },
    ]
    for (const [payload] of sendMock.mock.calls as [ResendPayload][]) {
      expect(payload.attachments).toEqual(expected)
      expect(payload.react.props.attachments).toEqual([{ filename: 'Ugovor.pdf', bytes: PDF_BYTES.length }])
    }
    expect(adminCopyMock).toHaveBeenCalled()
    for (const [payload] of adminCopyMock.mock.calls) {
      expect(payload.attachments).toEqual(expected)
    }

    const linked = await db.emailAttachment.findUniqueOrThrow({ where: { id: pdfId } })
    expect(linked.campaignId).toBe(res.campaignId)

    const detail = await getCampaignDetail(res.campaignId)
    expect(detail.attachments).toEqual([{ id: pdfId, filename: 'Ugovor.pdf', bytes: PDF_BYTES.length }])

    const html = await getCampaignEmailHtml(res.campaignId)
    expect(html.success && html.html).toContain('Ugovor.pdf')
  })

  it('sends no attachments key at all when none were added', async () => {
    await loginAdmin()
    const group = await makeCohort([uniqEmail('att-none')])
    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0]).not.toHaveProperty('attachments')
  })

  it('refuses another city draft, an already-sent attachment and an unknown id — nothing is created', async () => {
    await loginAdmin()
    const group = await makeCohort([uniqEmail('att-refuse')])
    const before = await db.emailCampaign.count()

    const sibenikDraft = await createDraft('SIBENIK', 100)
    const crossCity = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: [sibenikDraft.id],
      ...CONTENT,
    })
    expect(crossCity).toMatchObject({ success: false })

    const unknown = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: ['nepostojeci-id'],
      ...CONTENT,
    })
    expect(unknown).toMatchObject({ success: false })
    expect(await db.emailCampaign.count()).toBe(before)

    // First campaign claims the file; a second one reusing it is refused.
    const pdfId = await uploadPdf()
    const first = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: [pdfId],
      ...CONTENT,
    })
    if (!first.success) throw new Error(first.error)
    await settle(first.campaignId)
    const second = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: [pdfId],
      ...CONTENT,
    })
    expect(second).toMatchObject({ success: false })
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a set over the total size limit', async () => {
    await loginAdmin()
    const group = await makeCohort([uniqEmail('att-total')])
    // 3 × 6 MB = 18 MB, each under the per-file cap, together over the 15 MB total.
    const drafts = await Promise.all([1, 2, 3].map(() => createDraft('SPLIT', 6 * 1024 * 1024)))
    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: drafts.map((d) => d.id),
      ...CONTENT,
    })
    expect(res).toMatchObject({ success: false })
    expect(sendMock).not.toHaveBeenCalled()
    const stillDrafts = await db.emailAttachment.count({
      where: { id: { in: drafts.map((d) => d.id) }, campaignId: null },
    })
    expect(stillDrafts).toBe(3)
  })

  it('the step-1 preview lists the attachments', async () => {
    await loginAdmin()
    const pdfId = await uploadPdf('Cjenik 2026.pdf')
    const res = await previewEmailHtml({ kind: 'CUSTOM', attachmentIds: [pdfId], ...CONTENT })
    expect(res.success).toBe(true)
    expect(res.success && res.html).toContain('Cjenik 2026.pdf')
    expect(res.success && res.html).toContain('Prilozi')
  })
})

describe('resumeEmailCampaign — attachments', () => {
  async function sendThenInterrupt() {
    await loginAdmin()
    const done = uniqEmail('att-resume-done')
    const left = uniqEmail('att-resume-left')
    const group = await makeCohort([done, left])
    const pdfId = await uploadPdf('Ugovor.pdf')
    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: [pdfId],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)
    await db.emailCampaignRecipient.updateMany({
      where: { campaignId: res.campaignId, parentEmail: left },
      data: { status: 'PENDING' },
    })
    await db.emailCampaign.update({
      where: { id: res.campaignId },
      data: { finishedAt: null },
    })
    sendMock.mockClear()
    adminCopyMock.mockClear()
    return { campaignId: res.campaignId, pdfId, left }
  }

  it('attaches the same files to the parents still owed a mail, without a second admin copy', async () => {
    const { campaignId, left } = await sendThenInterrupt()

    const resumed = await resumeEmailCampaign(campaignId)
    expect(resumed).toMatchObject({ success: true, remaining: 1 })
    await settle(campaignId)

    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = sendMock.mock.calls[0][0] as ResendPayload
    expect(payload.to).toBe(left)
    expect(payload.attachments).toEqual([
      { filename: 'Ugovor.pdf', contentType: 'application/pdf', content: PDF_BYTES.toString('base64') },
    ])
    expect(adminCopyMock).not.toHaveBeenCalled()
  })

  it('mails nobody when the files cannot be read — the rows stay PENDING', async () => {
    const { campaignId, pdfId, left } = await sendThenInterrupt()
    await db.emailAttachmentContent.delete({ where: { attachmentId: pdfId } })

    const resumed = await resumeEmailCampaign(campaignId)
    expect(resumed).toMatchObject({ success: true })

    expect(sendMock, 'no parent receives the mail without its contract').not.toHaveBeenCalled()
    const row = await db.emailCampaignRecipient.findFirstOrThrow({
      where: { campaignId, parentEmail: left },
    })
    expect(row.status).toBe('PENDING')
  })
})

describe('deleteDraftEmailAttachment', () => {
  it('deletes the admin own draft only — never a sent file, never the other city', async () => {
    const admin = await loginAdmin()
    const own = await createDraft('SPLIT', 100)
    const other = await createDraft('SIBENIK', 100)
    const campaign = await db.emailCampaign.create({
      data: {
        city: 'SPLIT',
        kind: 'CUSTOM',
        sourceSchoolYear: SOURCE_YEAR,
        sourceGroupIds: [],
        subject: 'Poslana',
        bodyText: 'Poslana poruka s privitkom.',
        sentById: admin.id,
      },
    })
    const sent = await createDraft('SPLIT', 100)
    await db.emailAttachment.update({ where: { id: sent.id }, data: { campaignId: campaign.id } })

    await deleteDraftEmailAttachment(own.id)
    await deleteDraftEmailAttachment(other.id)
    await deleteDraftEmailAttachment(sent.id)

    expect(await db.emailAttachment.findUnique({ where: { id: own.id } })).toBeNull()
    expect(await db.emailAttachment.findUnique({ where: { id: other.id } })).not.toBeNull()
    expect(await db.emailAttachment.findUnique({ where: { id: sent.id } })).not.toBeNull()
  })
})

describe('GET /api/admin/email-attachment/[attachmentId]', () => {
  async function download(attachmentId: string) {
    const req = new Request(`http://localhost/api/admin/email-attachment/${attachmentId}`)
    return downloadGET(req, { params: Promise.resolve({ attachmentId }) })
  }

  it('serves the file to an admin of its city with the exact UTF-8 name', async () => {
    await loginAdmin()
    const id = await uploadPdf('Ugovor – Split.pdf')
    const res = await download(id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain(
      `filename*=UTF-8''${encodeURIComponent('Ugovor – Split.pdf')}`,
    )
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF_BYTES)).toBe(true)
  })

  it('404s the other city and 401s a non-admin', async () => {
    const sibenik = await createDraft('SIBENIK', 100)
    await loginAdmin('SPLIT')
    expect((await download(sibenik.id)).status).toBe(404)

    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SIBENIK' })
    expect((await download(sibenik.id)).status).toBe(401)
  })
})
