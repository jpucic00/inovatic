/**
 * The SCHOOL_CALENDAR campaign: the year's "Raspored radionica" PDF mailed to
 * the parents of the selected standard groups.
 *
 * What this file pins:
 *  - standard groups only, re-enforced on the server (a radionica or a
 *    competition group id is refused, not silently dropped);
 *  - one mail per parent inbox, siblings merged;
 *  - the PDF is rendered ONCE at creation and stored as the campaign's own
 *    attachment — a resume sends those bytes, even if the plan changed since;
 *  - the admin's city decides whose calendar is attached;
 *  - an unplanned year refuses the campaign outright.
 *
 * Far-future years keep the plans here out of every other file's way: the
 * calendar reads every STANDARD course's windows for (city, year).
 */
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
  createModule,
  createModuleSchedule,
  createStudent,
} from './helpers/factory'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import { computeSchoolYearPlan } from '@/lib/school-year-planner'
import { fromDateKey } from '@/lib/session-dates'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

type ResendAttachment = { filename: string; contentType: string; content: string }
type ResendPayload = { to: string; subject: string; attachments?: ResendAttachment[] }

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

const { sendEmailCampaign, previewEmailHtml, previewEmailRecipients, resumeEmailCampaign } =
  await import('@/actions/admin/email-campaign')

/** Planned in both cities, on different dates. */
const YEAR = '2084/2085'
/** Planned in Split only, and broken after the campaign starts. */
const RESUME_YEAR = '2085/2086'
/** Groups but no plan. */
const UNPLANNED_YEAR = '2086/2087'

const SPLIT_FILENAME = 'Raspored radionica 2084.-2085. – Split.pdf'

const CONTENT = {
  subject: 'Raspored radionica za školsku godinu 2084./2085.',
  bodyText: 'U privitku se nalazi raspored radionica za ovu školsku godinu.',
}

let seq = 0
const uniqEmail = (p: string) =>
  `${p}-${Date.now().toString(36)}${(++seq).toString(36)}@test.hr`

async function planYear(city: City, schoolYear: string, kickoff: string) {
  const plan = computeSchoolYearPlan({
    startDate: fromDateKey(kickoff),
    activeWeekdays: ACTIVE_WEEKDAYS,
    holidayDates: new Set(),
  })
  const course = await createCourse({ kind: 'STANDARD' })
  for (const [i, window] of plan.modules.entries()) {
    const mod = await createModule(course.id, { sortOrder: i })
    await createModuleSchedule(mod.id, {
      schoolYear,
      city,
      startDate: window.startDate,
      endDate: window.endDate,
    })
  }
}

await planYear('SPLIT', YEAR, '2084-10-02')
await planYear('SIBENIK', YEAR, '2084-11-06')
await planYear('SPLIT', RESUME_YEAR, '2085-10-01')

async function makeGroup(
  schoolYear: string,
  opts: { city?: City; kind?: 'STANDARD' | 'RADIONICA' | 'COMPETITION' } = {},
) {
  const city = opts.city ?? 'SPLIT'
  const location = await createLocation({ city })
  const course = await createCourse({ kind: opts.kind ?? 'STANDARD' })
  return createGroup({ courseId: course.id, locationId: location.id, schoolYear, city })
}

async function enroll(groupId: string, schoolYear: string, parentEmail: string, city: City = 'SPLIT') {
  const student = await createStudent({ city, parentEmail })
  await createEnrollment(student.id, groupId, { schoolYear })
  return student
}

async function loginAdmin(city: City = 'SPLIT') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
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

function campaignAttachments(campaignId: string) {
  return db.emailAttachment.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      city: true,
      filename: true,
      mimeType: true,
      bytes: true,
      content: { select: { data: true } },
    },
  })
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

describe('SCHOOL_CALENDAR — audience', () => {
  it('refuses a radionica or a competition group id on the server', async () => {
    await loginAdmin()
    const standard = await makeGroup(YEAR)
    const radionica = await makeGroup(YEAR, { kind: 'RADIONICA' })
    const competition = await makeGroup(YEAR, { kind: 'COMPETITION' })
    await enroll(radionica.id, YEAR, uniqEmail('radionica'))

    for (const smuggled of [radionica.id, competition.id]) {
      const res = await sendEmailCampaign({
        kind: 'SCHOOL_CALENDAR',
        sourceSchoolYear: YEAR,
        sourceGroupIds: [standard.id, smuggled],
        ...CONTENT,
      })
      expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })

      const preview = await previewEmailRecipients({
        kind: 'SCHOOL_CALENDAR',
        sourceSchoolYear: YEAR,
        sourceGroupIds: [smuggled],
      })
      expect(preview.success).toBe(false)
    }
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('refuses the preporuka and individual-children modes', async () => {
    await loginAdmin()
    const byRecommendation = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: YEAR,
      recommendations: ['COMPETITION_PREP'],
      ...CONTENT,
    })
    expect(byRecommendation).toEqual({
      success: false,
      error: 'Raspored školske godine šalje se odabirom grupa.',
    })

    const student = await createStudent({ parentEmail: uniqEmail('dijete') })
    const byStudents = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: YEAR,
      sourceStudentIds: [student.id],
      ...CONTENT,
    })
    expect(byStudents.success).toBe(false)
  })

  it('mails one inbox once, siblings merged, with the PDF attached', async () => {
    const admin = await loginAdmin()
    const family = uniqEmail('obitelj')
    const other = uniqEmail('drugi')
    const groupA = await makeGroup(YEAR)
    const groupB = await makeGroup(YEAR)
    await enroll(groupA.id, YEAR, family)
    await enroll(groupB.id, YEAR, family.toUpperCase())
    await enroll(groupA.id, YEAR, other)

    const res = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [groupA.id, groupB.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    expect(res.total).toBe(2)
    await settle(res.campaignId)

    const mails = sendMock.mock.calls.map(([p]) => p as ResendPayload)
    expect(mails.map((m) => m.to).sort()).toEqual([family, other].sort())
    for (const mail of mails) {
      // No child named — the file is the same for everyone.
      expect(mail.subject).toBe(CONTENT.subject)
      expect(mail.attachments).toHaveLength(1)
      const [attachment] = mail.attachments ?? []
      expect(attachment.filename).toBe(SPLIT_FILENAME)
      expect(attachment.contentType).toBe('application/pdf')
      expect(Buffer.from(attachment.content, 'base64').subarray(0, 5).toString()).toBe('%PDF-')
    }

    // The admin copy carries the same file — it is the office's record.
    const copy = adminCopyMock.mock.calls.find(([p]) => p.to === admin.email)?.[0]
    expect(copy?.attachments?.[0]?.filename).toBe(SPLIT_FILENAME)
  }, 30_000)
})

describe('SCHOOL_CALENDAR — the stored PDF', () => {
  it("is created once, linked to the campaign in the admin's city, beside the admin's own files", async () => {
    await loginAdmin()
    const group = await makeGroup(YEAR)
    await enroll(group.id, YEAR, uniqEmail('roditelj'))
    const draft = await db.emailAttachment.create({
      data: {
        city: 'SPLIT',
        filename: 'Cjenik.pdf',
        mimeType: 'application/pdf',
        bytes: 9,
        content: { create: { data: Buffer.from('%PDF-1.4\n') } },
      },
    })

    const res = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
      attachmentIds: [draft.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)

    const rows = await campaignAttachments(res.campaignId)
    expect(rows.map((r) => r.filename)).toEqual(['Cjenik.pdf', SPLIT_FILENAME])
    const calendar = rows[1]
    expect(calendar).toMatchObject({ city: 'SPLIT', mimeType: 'application/pdf' })
    expect(calendar.bytes).toBe(calendar.content?.data.length)
    expect(Buffer.from(calendar.content?.data ?? []).subarray(0, 5).toString()).toBe('%PDF-')

    const [mail] = sendMock.mock.calls.map(([p]) => p as ResendPayload)
    expect(mail.attachments?.map((a) => a.filename)).toEqual(['Cjenik.pdf', SPLIT_FILENAME])
  }, 30_000)

  it('is resent byte-for-byte on resume, never re-rendered', async () => {
    // This test breaks the year's plan below; a re-run without the tier's reset
    // must start from the intact plan again.
    await db.schoolYearHoliday.deleteMany({ where: { schoolYear: RESUME_YEAR, city: 'SPLIT' } })
    await loginAdmin()
    const done = uniqEmail('resume-done')
    const left = uniqEmail('resume-left')
    const group = await makeGroup(RESUME_YEAR)
    await enroll(group.id, RESUME_YEAR, done)
    await enroll(group.id, RESUME_YEAR, left)

    const res = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: RESUME_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)
    const [stored] = await campaignAttachments(res.campaignId)

    await db.emailCampaignRecipient.updateMany({
      where: { campaignId: res.campaignId, parentEmail: left },
      data: { status: 'PENDING' },
    })
    await db.emailCampaign.update({ where: { id: res.campaignId }, data: { finishedAt: null } })
    // Break the plan: a holiday inside the windows leaves every weekday of
    // that week one termin short. A resume that re-rendered would now fail.
    await db.schoolYear.upsert({
      where: { label: RESUME_YEAR },
      create: { label: RESUME_YEAR },
      update: {},
    })
    for (const date of ['2085-11-05', '2085-11-06', '2085-11-07', '2085-11-08', '2085-11-09', '2085-11-10']) {
      await db.schoolYearHoliday.upsert({
        where: { schoolYear_city_date: { schoolYear: RESUME_YEAR, city: 'SPLIT', date: fromDateKey(date) } },
        create: { schoolYear: RESUME_YEAR, city: 'SPLIT', date: fromDateKey(date), name: null },
        update: {},
      })
    }
    sendMock.mockClear()

    const resumed = await resumeEmailCampaign(res.campaignId)
    expect(resumed).toMatchObject({ success: true, remaining: 1 })
    await settle(res.campaignId)

    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = sendMock.mock.calls[0][0] as ResendPayload
    expect(payload.to).toBe(left)
    expect(payload.attachments).toEqual([
      {
        filename: 'Raspored radionica 2085.-2086. – Split.pdf',
        contentType: 'application/pdf',
        content: Buffer.from(stored.content?.data ?? []).toString('base64'),
      },
    ])
    const after = await campaignAttachments(res.campaignId)
    expect(after.map((r) => r.id)).toEqual([stored.id])
  }, 30_000)
})

describe('SCHOOL_CALENDAR — city and plan', () => {
  it("attaches the Šibenik calendar for a Šibenik admin and refuses Split's groups", async () => {
    await loginAdmin('SIBENIK')
    const sibenikGroup = await makeGroup(YEAR, { city: 'SIBENIK' })
    await enroll(sibenikGroup.id, YEAR, uniqEmail('sibenik'), 'SIBENIK')
    const splitGroup = await makeGroup(YEAR)

    const smuggled = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [splitGroup.id],
      ...CONTENT,
    })
    expect(smuggled).toEqual({ success: false, error: 'Nevaljani podaci.' })

    const res = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [sibenikGroup.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    await settle(res.campaignId)

    const [row] = await campaignAttachments(res.campaignId)
    expect(row).toMatchObject({
      city: 'SIBENIK',
      filename: 'Raspored radionica 2084.-2085. – Šibenik.pdf',
    })
    const campaign = await db.emailCampaign.findUniqueOrThrow({ where: { id: res.campaignId } })
    expect(campaign.city).toBe('SIBENIK')
  }, 30_000)

  it('refuses an unplanned year before creating anything', async () => {
    await loginAdmin()
    const group = await makeGroup(UNPLANNED_YEAR)
    await enroll(group.id, UNPLANNED_YEAR, uniqEmail('bez-plana'))
    const before = await db.emailCampaign.count()

    const res = await sendEmailCampaign({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: UNPLANNED_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toContain('nema dovršen plan')
    expect(await db.emailCampaign.count()).toBe(before)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('previews the real file in "Prilozi", and refuses an unplanned year there too', async () => {
    await loginAdmin()
    const ok = await previewEmailHtml({ kind: 'SCHOOL_CALENDAR', sourceSchoolYear: YEAR, ...CONTENT })
    if (!ok.success) throw new Error(ok.error)
    expect(ok.html).toContain('Raspored radionica 2084.-2085.')

    const refused = await previewEmailHtml({
      kind: 'SCHOOL_CALENDAR',
      sourceSchoolYear: UNPLANNED_YEAR,
      ...CONTENT,
    })
    expect(refused.success).toBe(false)
  }, 30_000)
})
