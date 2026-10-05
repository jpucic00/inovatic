import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createAssessment,
  createCourse,
  createEnrollment,
  createGroup,
  createLocation,
  createStudent,
} from './helpers/factory'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

type ResendPayload = { to: string; subject: string }
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: (p: ResendPayload) =>
        p.subject?.startsWith('[Kopija] ')
          ? Promise.resolve({ data: { id: 'copy' }, error: null })
          : sendMock(p),
    }
  },
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const SOURCE_YEAR = computeSchoolYear()
const TARGET_YEAR = getNextSchoolYear(SOURCE_YEAR)

const { previewEmailRecipients, sendEmailCampaign } = await import(
  '@/actions/admin/email-campaign'
)
const { getStudents } = await import('@/actions/admin/student')

let seq = 0
const uniqEmail = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}@test.hr`

const CONTENT = {
  subject: 'Filtrirana kampanja',
  bodyText: 'Poruka samo dijelu roditelja odabranih grupa.',
}

async function makeGroup(kind: ProgramKind = 'STANDARD') {
  const location = await createLocation({ city: 'SPLIT' })
  const course = await createCourse(
    kind === 'RADIONICA' ? { kind, city: 'SPLIT', schoolYear: SOURCE_YEAR } : { kind },
  )
  return createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: SOURCE_YEAR,
    city: 'SPLIT',
  })
}

async function enroll(
  groupId: string,
  data: {
    parentEmail?: string
    contractSignedAt?: Date | null
    consentWebsite?: boolean | null
    fullYearPaidAt?: Date | null
  } = {},
) {
  const student = await createStudent({
    city: 'SPLIT',
    parentEmail: data.parentEmail ?? uniqEmail('parent'),
  })
  const enrollment = await createEnrollment(student.id, groupId, {
    schoolYear: SOURCE_YEAR,
    fullYearPaidAt: data.fullYearPaidAt ?? null,
  })
  await db.enrollment.update({
    where: { id: enrollment.id },
    data: {
      contractSignedAt: data.contractSignedAt ?? null,
      consentWebsite: data.consentWebsite ?? null,
    },
  })
  return { student, enrollment, parentEmail: student.parentEmail as string }
}

async function emails(input: Parameters<typeof previewEmailRecipients>[0]) {
  const res = await previewEmailRecipients(input)
  if (!res.success) throw new Error(res.error)
  return res.recipients.map((r) => r.parentEmail).sort()
}

let adminId: string

beforeAll(async () => {
  process.env.RESEND_API_KEY = 'test_resend_key'
  process.env.EMAIL_SEND_THROTTLE_MS = '0'
  adminId = (await createAdmin({ city: 'SPLIT' })).id
  await db.schoolYear.upsert({
    where: { label: TARGET_YEAR },
    update: {},
    create: { label: TARGET_YEAR },
  })
})

afterAll(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_SEND_THROTTLE_MS
})

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue({ data: { id: 'sent' }, error: null })
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { value: TARGET_YEAR, name } : undefined,
  })
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
})

describe('e-mail campaign cohort — Ugovor filter', () => {
  it('no filter keeps everyone; SIGNED / NOT_SIGNED split the group', async () => {
    const group = await makeGroup()
    const signed = await enroll(group.id, { contractSignedAt: new Date() })
    const unsigned = await enroll(group.id)
    const base = { kind: 'CUSTOM' as const, sourceSchoolYear: SOURCE_YEAR, sourceGroupIds: [group.id] }

    expect(await emails(base)).toEqual([signed.parentEmail, unsigned.parentEmail].sort())
    expect(await emails({ ...base, contractFilter: 'SIGNED' })).toEqual([signed.parentEmail])
    expect(await emails({ ...base, contractFilter: 'NOT_SIGNED' })).toEqual([unsigned.parentEmail])
  })

  it('asks about the enrollment in the selected group, not another group the child attends', async () => {
    const selected = await makeGroup()
    const other = await makeGroup()
    // Signed in the selected group, unsigned elsewhere — not a "nije potpisan" here.
    const child = await enroll(selected.id, { contractSignedAt: new Date() })
    await createEnrollment(child.student.id, other.id, { schoolYear: SOURCE_YEAR })

    expect(
      await emails({
        kind: 'CUSTOM',
        sourceSchoolYear: SOURCE_YEAR,
        sourceGroupIds: [selected.id],
        contractFilter: 'NOT_SIGNED',
      }),
    ).toEqual([])
  })
})

describe('e-mail campaign cohort — Privole filter', () => {
  it('"Bez privole" counts a refusal and a form not entered yet', async () => {
    const group = await makeGroup()
    const given = await enroll(group.id, { consentWebsite: true })
    const refused = await enroll(group.id, { consentWebsite: false })
    const missing = await enroll(group.id)

    const res = await emails({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      consentFilter: 'NO_WEBSITE',
    })
    expect(res).toEqual([refused.parentEmail, missing.parentEmail].sort())
    expect(res).not.toContain(given.parentEmail)
  })
})

describe('e-mail campaign cohort — Plaćanje filter', () => {
  it('matches the Učenici payment status in the source year', async () => {
    // A radionica is owed from enrollment, so unpaid = Nije plaćeno at once.
    const group = await makeGroup('RADIONICA')
    const paid = await enroll(group.id, { fullYearPaidAt: new Date() })
    const owing = await enroll(group.id)
    const base = { kind: 'CUSTOM' as const, sourceSchoolYear: SOURCE_YEAR, sourceGroupIds: [group.id] }

    expect(await emails({ ...base, paymentFilter: 'PENDING' })).toEqual([owing.parentEmail])
    expect(await emails({ ...base, paymentFilter: 'PAID' })).toEqual([paid.parentEmail])
    expect(await emails({ ...base, paymentFilter: 'NOT_DUE' })).toEqual([])
  })

  it('combines with the other filters as AND', async () => {
    const group = await makeGroup('RADIONICA')
    const target = await enroll(group.id)
    await enroll(group.id, { contractSignedAt: new Date() })
    await enroll(group.id, { fullYearPaidAt: new Date() })

    expect(
      await emails({
        kind: 'CUSTOM',
        sourceSchoolYear: SOURCE_YEAR,
        sourceGroupIds: [group.id],
        paymentFilter: 'PENDING',
        contractFilter: 'NOT_SIGNED',
      }),
    ).toEqual([target.parentEmail])
  })
})

describe('e-mail campaign cohort — other selection modes', () => {
  it('a filtered-out child is not listed as an ungraded skip on an evaluation', async () => {
    const group = await makeGroup()
    const graded = await enroll(group.id)
    await createAssessment(graded.student.id, group.id, adminId)
    const ungradedSigned = await enroll(group.id, { contractSignedAt: new Date() })

    const res = await previewEmailRecipients({
      kind: 'EVALUATION',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      contractFilter: 'NOT_SIGNED',
    })
    if (!res.success) throw new Error(res.error)
    expect(res.recipients.map((r) => r.parentEmail)).toEqual([graded.parentEmail])
    expect(res.skipped.map((s) => s.studentId)).not.toContain(ungradedSigned.student.id)
  })

  it('narrows a preporuka cohort too', async () => {
    const group = await makeGroup()
    const signed = await enroll(group.id, { contractSignedAt: new Date() })
    const unsigned = await enroll(group.id)
    for (const s of [signed, unsigned]) {
      await createAssessment(s.student.id, group.id, adminId, {
        recommendationKind: 'COMPETITION_PREP',
      })
    }

    const res = await emails({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      recommendations: ['COMPETITION_PREP'],
      contractFilter: 'SIGNED',
    })
    expect(res).toContain(signed.parentEmail)
    expect(res).not.toContain(unsigned.parentEmail)
  })

  it('rejects a filter value outside the vocabulary', async () => {
    const group = await makeGroup()
    const res = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      contractFilter: 'MAYBE' as unknown as 'SIGNED',
    })
    expect(res.success).toBe(false)
  })
})

describe('e-mail campaign recipient list — child badges', () => {
  it('carries each child\'s Plaćanje status and contract state for the source year', async () => {
    const group = await makeGroup('RADIONICA')
    const paidSigned = await enroll(group.id, {
      fullYearPaidAt: new Date(),
      contractSignedAt: new Date(),
    })
    const owingUnsigned = await enroll(group.id)

    const res = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
    })
    if (!res.success) throw new Error(res.error)
    const byId = new Map(res.recipients.flatMap((r) => r.children).map((c) => [c.studentId, c]))
    expect(byId.get(paidSigned.student.id)).toMatchObject({
      paymentStatus: 'PAID',
      contract: 'SIGNED',
    })
    expect(byId.get(owingUnsigned.student.id)).toMatchObject({
      paymentStatus: 'PENDING',
      contract: 'NOT_SIGNED',
    })
  })

  it('reads the contract off the selected groups only', async () => {
    const selected = await makeGroup()
    const other = await makeGroup()
    const child = await enroll(selected.id)
    const elsewhere = await createEnrollment(child.student.id, other.id, { schoolYear: SOURCE_YEAR })
    await db.enrollment.update({
      where: { id: elsewhere.id },
      data: { contractSignedAt: new Date() },
    })

    const res = await previewEmailRecipients({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [selected.id],
    })
    if (!res.success) throw new Error(res.error)
    expect(res.recipients[0].children[0].contract).toBe('NOT_SIGNED')
  })
})

describe('sendEmailCampaign — filters', () => {
  it('mails only the filtered cohort and records the filters on the campaign', async () => {
    const group = await makeGroup()
    const unsigned = await enroll(group.id, { consentWebsite: false })
    await enroll(group.id, { contractSignedAt: new Date(), consentWebsite: false })

    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      contractFilter: 'NOT_SIGNED',
      consentFilter: 'NO_WEBSITE',
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    expect(res.total).toBe(1)

    const campaign = await db.emailCampaign.findUniqueOrThrow({
      where: { id: res.campaignId },
      select: { sourceFilters: true, recipients: { select: { parentEmail: true } } },
    })
    expect(campaign.recipients.map((r) => r.parentEmail)).toEqual([unsigned.parentEmail])
    expect(campaign.sourceFilters).toEqual([
      'Ugovor nije potpisan',
      'Bez privole: web-stranica',
    ])
  })

  it('records no filters when none were set', async () => {
    const group = await makeGroup()
    await enroll(group.id)
    const res = await sendEmailCampaign({
      kind: 'CUSTOM',
      sourceSchoolYear: SOURCE_YEAR,
      sourceGroupIds: [group.id],
      ...CONTENT,
    })
    if (!res.success) throw new Error(res.error)
    const campaign = await db.emailCampaign.findUniqueOrThrow({
      where: { id: res.campaignId },
      select: { sourceFilters: true },
    })
    expect(campaign.sourceFilters).toEqual([])
  })
})

describe('getStudents — Ugovor filter', () => {
  it('narrows on the enrollment of the year, inside the group filter', async () => {
    const marker = `Ugovor${Date.now().toString(36)}`
    const groupA = await makeGroup()
    const groupB = await makeGroup()
    const mk = async (lastName: string) =>
      createStudent({ city: 'SPLIT', lastName: `${marker}${lastName}` })

    const signed = await mk('Da')
    await db.enrollment.update({
      where: { id: (await createEnrollment(signed.id, groupA.id, { schoolYear: SOURCE_YEAR })).id },
      data: { contractSignedAt: new Date() },
    })
    const unsigned = await mk('Ne')
    await createEnrollment(unsigned.id, groupA.id, { schoolYear: SOURCE_YEAR })
    // Signed in A, unsigned in B.
    const mixed = await mk('Mix')
    await db.enrollment.update({
      where: { id: (await createEnrollment(mixed.id, groupA.id, { schoolYear: SOURCE_YEAR })).id },
      data: { contractSignedAt: new Date() },
    })
    await createEnrollment(mixed.id, groupB.id, { schoolYear: SOURCE_YEAR })

    const ids = async (filters: Parameters<typeof getStudents>[0]) =>
      (await getStudents({ search: marker, schoolYear: SOURCE_YEAR, pageSize: 100, ...filters })).data
        .map((r) => r.id)
        .sort()

    expect(await ids({ contract: 'SIGNED' })).toEqual([signed.id, mixed.id].sort())
    expect(await ids({ contract: 'NOT_SIGNED' })).toEqual([unsigned.id, mixed.id].sort())
    expect(await ids({ contract: 'NOT_SIGNED', groupId: groupA.id })).toEqual([unsigned.id])
  })
})
