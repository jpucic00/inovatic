/**
 * The SCHEDULE campaign: "which group is my child in, and when?" mailed to
 * every parent of the selected groups.
 *
 * What this file pins, in order of importance:
 *  - one mail per parent INBOX with siblings merged — the owner's ask, and the
 *    one place this kind deliberately departs from EVALUATION / CREDENTIALS;
 *  - every card lists ALL of the child's groups in the source year, not only
 *    the selected ones — the selection decides who is mailed, not what;
 *  - the send re-proves ownership per child and fails closed;
 *  - no sentKey, so a corrected roster can be mailed again.
 */
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
import type { ScheduleCard } from '@/lib/schedule-email-recipients'

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

const { sendEmailCampaign, previewEmailRecipients, getRecipientEmailHtml } = await import(
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
  subject: 'Termini vaših grupa – Inovatic',
  bodyText: 'U nastavku se nalaze termini grupa u koje je Vaše dijete upisano.',
}

async function makeGroup(
  over: {
    city?: City
    kind?: 'STANDARD' | 'RADIONICA'
    title?: string
    name?: string
    dayOfWeek?: string
    startTime?: string
    endTime?: string
    dateStart?: string
    dateEnd?: string
    locationName?: string
    locationAddress?: string
  } = {},
) {
  const city = over.city ?? 'SPLIT'
  const location = await createLocation({
    city,
    name: over.locationName,
    address: over.locationAddress,
  })
  const course = await createCourse({ kind: over.kind ?? 'STANDARD', title: over.title })
  return createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: YEAR,
    city,
    name: over.name,
    dayOfWeek: over.dayOfWeek ?? 'Utorak',
    startTime: over.startTime ?? '17:00',
    endTime: over.endTime ?? '18:30',
    dateStart: over.dateStart,
    dateEnd: over.dateEnd,
  })
}

async function enrolledChild(
  groupIds: string | string[],
  opts: { parentEmail?: string; city?: City; firstName?: string } = {},
) {
  const student = await createStudent({
    city: opts.city ?? 'SPLIT',
    firstName: opts.firstName,
    parentEmail: opts.parentEmail ?? uniqEmail('roditelj'),
  })
  for (const groupId of Array.isArray(groupIds) ? groupIds : [groupIds]) {
    await createEnrollment(student.id, groupId, { schoolYear: YEAR })
  }
  return student
}

/** What actually left the building, per mail. */
function sentMails() {
  return sendMock.mock.calls.map(([payload]) => ({
    to: payload.to as string,
    subject: payload.subject as string,
    schedules: payload.react?.props?.schedules as ScheduleCard[] | undefined,
  }))
}

async function asSplitAdmin() {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  return admin
}

describe('SCHEDULE campaign — one mail per parent inbox', () => {
  it('mails two siblings on one address ONE message with a card for each', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key'
    process.env.EMAIL_SEND_THROTTLE_MS = '0'
    try {
      await asSplitAdmin()
      const slr = await makeGroup({
        title: 'Svijet LEGO robotike 2',
        name: 'SLR 2 – utorkom',
        dayOfWeek: 'Utorak',
        locationName: 'Velebitska 32',
        locationAddress: 'Velebitska 32, 21000 Split',
      })
      const uvod = await makeGroup({
        title: 'Uvod u Svijet LEGO robotike',
        name: 'Uvod – četvrtkom',
        dayOfWeek: 'Četvrtak',
        startTime: '17:00',
        endTime: '18:00',
      })
      const shared = uniqEmail('obitelj')
      const ana = await enrolledChild(slr.id, { parentEmail: shared, firstName: 'Ana' })
      const marko = await enrolledChild(uvod.id, { parentEmail: shared, firstName: 'Marko' })

      const res = await sendEmailCampaign({
        kind: 'SCHEDULE',
        ...CONTENT,
        sourceSchoolYear: YEAR,
        sourceGroupIds: [slr.id, uvod.id],
      })
      expect(res.success).toBe(true)
      if (!res.success) return
      const done = await settle(res.campaignId)

      // One row, one send — the family, not the children.
      expect(res.total).toBe(1)
      expect(done).toEqual({ sent: 1, failed: 0 })
      const rows = await db.emailCampaignRecipient.findMany({
        where: { campaignId: res.campaignId },
        select: { parentEmail: true, studentIds: true, status: true, sentKey: true },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0].parentEmail).toBe(shared)
      expect(rows[0].studentIds.sort()).toEqual([ana.id, marko.id].sort())
      expect(rows[0].status).toBe('SENT')
      // Repeatable by design — nothing claims this inbox for a later run.
      expect(rows[0].sentKey).toBeNull()

      // On the wire: both cards in the one mail, each child's own groups, and
      // the subject naming both.
      expect(sendMock).toHaveBeenCalledTimes(1)
      const [mail] = sentMails()
      expect(mail.to).toBe(shared)
      expect(mail.subject).toBe(`${CONTENT.subject} – Ana ${ana.lastName}, Marko ${marko.lastName}`)
      expect(mail.schedules).toEqual([
        {
          childName: `Ana ${ana.lastName}`,
          groups: [
            {
              programTitle: 'Svijet LEGO robotike 2',
              groupName: 'SLR 2 – utorkom',
              schedule: 'Utorak · 17:00–18:30',
              locationName: 'Velebitska 32',
              locationAddress: 'Velebitska 32, 21000 Split',
            },
          ],
        },
        {
          childName: `Marko ${marko.lastName}`,
          groups: [
            expect.objectContaining({
              programTitle: 'Uvod u Svijet LEGO robotike',
              groupName: 'Uvod – četvrtkom',
              schedule: 'Četvrtak · 17:00–18:00',
            }),
          ],
        },
      ])
    } finally {
      delete process.env.RESEND_API_KEY
      delete process.env.EMAIL_SEND_THROTTLE_MS
    }
  })

  it('lists EVERY group of the child in the year, not only the selected one', async () => {
    // The selection says who gets mailed. A parent asking "what is my child
    // signed up for" wants the whole answer — the workshop too, even though
    // the admin only ticked the SLR group.
    process.env.RESEND_API_KEY = 'test_resend_key'
    process.env.EMAIL_SEND_THROTTLE_MS = '0'
    try {
      await asSplitAdmin()
      const slr = await makeGroup({ title: 'Svijet LEGO robotike 1' })
      const workshop = await makeGroup({
        kind: 'RADIONICA',
        title: 'Zimska radionica',
        dateStart: '2099-01-05',
        dateEnd: '2099-01-09',
        startTime: '09:00',
        endTime: '11:00',
      })
      const child = await enrolledChild([slr.id, workshop.id])

      const res = await sendEmailCampaign({
        kind: 'SCHEDULE',
        ...CONTENT,
        sourceSchoolYear: YEAR,
        sourceGroupIds: [slr.id],
      })
      expect(res.success).toBe(true)
      if (!res.success) return
      await settle(res.campaignId)

      const [mail] = sentMails()
      expect(mail.schedules).toHaveLength(1)
      expect(mail.schedules?.[0].childName).toBe(`${child.firstName} ${child.lastName}`)
      expect(mail.schedules?.[0].groups.map((g) => g.programTitle).sort()).toEqual(
        ['Svijet LEGO robotike 1', 'Zimska radionica'].sort(),
      )
      // A radionica renders its date range, not a weekday.
      expect(mail.schedules?.[0].groups.find((g) => g.programTitle === 'Zimska radionica')?.schedule)
        .toBe('05.01.2099. – 09.01.2099. · 09:00–11:00')
    } finally {
      delete process.env.RESEND_API_KEY
      delete process.env.EMAIL_SEND_THROTTLE_MS
    }
  })

  it('can select a radionica group directly — every group with a termin is fair game', async () => {
    await asSplitAdmin()
    const workshop = await makeGroup({
      kind: 'RADIONICA',
      dateStart: '2099-07-01',
      dateEnd: '2099-07-05',
    })
    const child = await enrolledChild(workshop.id)

    const preview = await previewEmailRecipients({
      kind: 'SCHEDULE',
      sourceSchoolYear: YEAR,
      sourceGroupIds: [workshop.id],
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return
    expect(preview.recipients).toHaveLength(1)
    expect(preview.recipients[0].studentIds).toEqual([child.id])
    expect(preview.recipients[0].children[0].name).toBe(`${child.firstName} ${child.lastName}`)
  })

  it('is repeatable — a second run to the same cohort sends again', async () => {
    await asSplitAdmin()
    const group = await makeGroup()
    await enrolledChild(group.id)

    const first = await sendEmailCampaign({
      kind: 'SCHEDULE',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(await settle(first.campaignId)).toEqual({ sent: 1, failed: 0 })

    const second = await sendEmailCampaign({
      kind: 'SCHEDULE',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.alreadySent).toBe(0)
    expect(await settle(second.campaignId)).toEqual({ sent: 1, failed: 0 })
  })

  it('reads the groups as they are at SEND time, so a moved child gets the new group', async () => {
    // The whole reason this kind exists is "we moved your child" — so a resume
    // or a re-send must not replay a snapshot taken when the campaign was
    // created. Here the move happens between creation and the (awaited) send
    // by forcing the send to look up rows afresh: the recipient row stores only
    // the student id, never the groups.
    await asSplitAdmin()
    const oldGroup = await makeGroup({ title: 'Stara grupa' })
    const newGroup = await makeGroup({ title: 'Nova grupa' })
    const child = await enrolledChild(oldGroup.id)
    const res = await sendEmailCampaign({
      kind: 'SCHEDULE',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [oldGroup.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    await settle(res.campaignId)

    // Move the child, then ask for the row's mail again: the detail-page
    // preview goes through the same builder the send loop uses.
    await db.enrollment.updateMany({
      where: { userId: child.id, scheduledGroupId: oldGroup.id },
      data: { scheduledGroupId: newGroup.id },
    })
    const row = await db.emailCampaignRecipient.findFirstOrThrow({
      where: { campaignId: res.campaignId },
      select: { id: true },
    })
    const html = await getRecipientEmailHtml(row.id)
    expect(html.success).toBe(true)
    if (!html.success) return
    expect(html.html).toContain('Nova grupa')
    expect(html.html).not.toContain('Stara grupa')
  })
})

describe('SCHEDULE campaign — the ownership guard fails closed', () => {
  it('marks the row FAILED and sends nothing when a named child is no longer this family’s', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key'
    process.env.EMAIL_SEND_THROTTLE_MS = '0'
    try {
      const admin = await asSplitAdmin()
      const group = await makeGroup()
      const shared = uniqEmail('obitelj')
      const ana = await enrolledChild(group.id, { parentEmail: shared })
      const other = await enrolledChild(group.id)

      // `sendEmailCampaign` writes the rows and runs the send in one awaited
      // call, so the disagreement is staged the way production produces it: a
      // PENDING row left behind by a deploy, whose `studentIds` no longer match
      // the addresses on the accounts — here it names another family's child.
      const campaign = await db.emailCampaign.create({
        data: {
          city: 'SPLIT',
          kind: 'SCHEDULE',
          sourceSchoolYear: YEAR,
          sourceGroupIds: [group.id],
          subject: CONTENT.subject,
          bodyText: CONTENT.bodyText,
          sentById: admin.id,
          totalCount: 1,
          recipients: {
            create: {
              parentEmail: shared,
              status: 'PENDING',
              childNames: ['Ana', 'Tuđe dijete'],
              studentIds: [ana.id, other.id],
            },
          },
        },
        select: { id: true },
      })

      const { resumeEmailCampaign } = await import('@/actions/admin/email-campaign')
      const res = await resumeEmailCampaign(campaign.id)
      expect(res.success).toBe(true)
      const done = await settle(campaign.id)

      expect(done).toEqual({ sent: 0, failed: 1 })
      expect(sendMock).not.toHaveBeenCalled()
      const row = await db.emailCampaignRecipient.findFirstOrThrow({
        where: { campaignId: campaign.id },
        select: { status: true, failureReason: true },
      })
      expect(row.status).toBe('FAILED')
      expect(row.failureReason).toContain('promijenila')
    } finally {
      delete process.env.RESEND_API_KEY
      delete process.env.EMAIL_SEND_THROTTLE_MS
    }
  })

  it('refuses a row whose child now belongs to a different address', async () => {
    await asSplitAdmin()
    const group = await makeGroup()
    const child = await enrolledChild(group.id)

    const res = await sendEmailCampaign({
      kind: 'SCHEDULE',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [group.id],
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    await settle(res.campaignId)

    // The address is corrected after the send; looking back at the row must
    // now refuse rather than render the child's groups for the old address.
    await db.user.update({ where: { id: child.id }, data: { parentEmail: uniqEmail('novi') } })
    const row = await db.emailCampaignRecipient.findFirstOrThrow({
      where: { campaignId: res.campaignId },
      select: { id: true },
    })
    const html = await getRecipientEmailHtml(row.id)
    expect(html).toMatchObject({ success: false, error: expect.stringContaining('promijenila') })
  })

  it('never lets a Šibenik admin select a Split group', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const splitGroup = await makeGroup({ city: 'SPLIT' })
    await enrolledChild(splitGroup.id)

    const res = await sendEmailCampaign({
      kind: 'SCHEDULE',
      ...CONTENT,
      sourceSchoolYear: YEAR,
      sourceGroupIds: [splitGroup.id],
    })
    expect(res).toMatchObject({ success: false })
  })
})
