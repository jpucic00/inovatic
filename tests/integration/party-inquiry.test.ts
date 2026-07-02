import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createInquiry } from './helpers/factory'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'
import type { PartyInquiryFormData } from '@/lib/validators/inquiry'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setSelectedYearCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined ? { value, name } : undefined,
  })
}

beforeAll(() => {
  // submitPartyInquiry sends a confirmation email when RESEND_API_KEY is set;
  // the test environment must not talk to Resend.
  delete process.env.RESEND_API_KEY
  setSelectedYearCookie(undefined)
})

const { submitPartyInquiry } = await import('@/actions/inquiry')
const { schedulePartyInquiry, getScheduledParties, getInquiries } = await import(
  '@/actions/admin/inquiry'
)

let emailCounter = 0
const uniqueEmail = () => `party-${Date.now().toString(36)}-${++emailCounter}@test.local`

function validParty(overrides: Partial<PartyInquiryFormData> = {}): PartyInquiryFormData {
  return {
    parentFirstName: 'Ana',
    parentLastName: 'Horvat',
    parentPhone: '+385912345678',
    parentEmail: uniqueEmail(),
    message: 'Proslava za osmero djece.',
    consent: true,
    ...overrides,
  }
}

describe('submitPartyInquiry', () => {
  it('creates a PARTY / NEW inquiry with combined parentName and null child fields', async () => {
    const form = validParty()
    const res = await submitPartyInquiry(form)
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.type).toBe('PARTY')
    expect(created?.status).toBe('NEW')
    expect(created?.parentName).toBe('Ana Horvat')
    expect(created?.childFirstName).toBeNull()
    expect(created?.childLastName).toBeNull()
    expect(created?.message).toBe('Proslava za osmero djece.')
    // No proposed date → files under the current computed school year.
    expect(created?.schoolYear).toBe(computeSchoolYear())
  })

  it('always files a new inquiry under the current year, even with a proposed date in another year', async () => {
    // A proposed date is only the parent's preference — the NEW inquiry must
    // still land in the admin's current Upiti view. (It gets re-filed under the
    // confirmed date's year later, when scheduled.)
    const proposedIso = '2022-12-12'
    const proposedYear = computeSchoolYear(new Date(`${proposedIso}T00:00:00.000Z`))
    const form = validParty({ partyProposedDate: proposedIso })

    const res = await submitPartyInquiry(form)
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.schoolYear).toBe(computeSchoolYear())
    expect(created?.schoolYear).not.toBe(proposedYear)
    // The preferred date is still recorded for the admin's reference.
    expect(created?.partyProposedDate?.toISOString().slice(0, 10)).toBe(proposedIso)
  })

  it('rejects an invalid submission', async () => {
    const res = await submitPartyInquiry(validParty({ parentEmail: 'not-an-email' }))
    expect(res.success).toBe(false)
  })
})

describe('schedulePartyInquiry', () => {
  it('sets PARTY_SCHEDULED + confirmed date/time but KEEPS the submission-year bucket', async () => {
    const admin = await createAdmin()
    const form = validParty()
    await submitPartyInquiry(form)
    const party = await db.inquiry.findFirstOrThrow({ where: { parentEmail: form.parentEmail } })
    const submissionYear = party.schoolYear

    // A confirmed date in a *different* school year than submission.
    const confirmedIso = '2026-12-20'
    const confirmedYear = computeSchoolYear(new Date(`${confirmedIso}T00:00:00.000Z`))
    expect(confirmedYear).not.toBe(submissionYear) // sanity: genuinely different years

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await schedulePartyInquiry({
      id: party.id,
      confirmedDate: confirmedIso,
      startTime: '18:00',
    })
    expect(res.success).toBe(true)

    const updated = await db.inquiry.findUniqueOrThrow({ where: { id: party.id } })
    expect(updated.status).toBe('PARTY_SCHEDULED')
    expect(updated.partyConfirmedDate?.toISOString().slice(0, 10)).toBe(confirmedIso)
    expect(updated.partyStartTime).toBe('18:00')
    // Stays in the year it was submitted so it remains in the admin's Upiti list.
    expect(updated.schoolYear).toBe(submissionYear)
  })

  it('refuses to schedule a non-party (course) inquiry', async () => {
    const admin = await createAdmin()
    const course = await createInquiry({ schoolYear: computeSchoolYear() })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await schedulePartyInquiry({
      id: course.id,
      confirmedDate: '2026-08-20',
      startTime: '18:00',
    })
    expect(res.success).toBe(false)

    const untouched = await db.inquiry.findUniqueOrThrow({ where: { id: course.id } })
    expect(untouched.status).toBe('NEW')
  })
})

describe('getScheduledParties', () => {
  it('keys on the CONFIRMED date year, not the submission year', async () => {
    const admin = await createAdmin()
    const form = validParty()
    await submitPartyInquiry(form)
    const party = await db.inquiry.findFirstOrThrow({ where: { parentEmail: form.parentEmail } })
    const submissionYear = party.schoolYear!

    // Confirm for a date in a different school year than submission.
    const confirmedIso = '2026-12-20'
    const confirmedYear = computeSchoolYear(new Date(`${confirmedIso}T00:00:00.000Z`))
    expect(confirmedYear).not.toBe(submissionYear)

    mockSession({ id: admin.id, role: 'ADMIN' })
    await schedulePartyInquiry({ id: party.id, confirmedDate: confirmedIso, startTime: '18:00' })

    // Shows on the calendar of the year it's HELD in…
    const inConfirmedYear = await getScheduledParties(confirmedYear)
    expect(inConfirmedYear.map((p) => p.id)).toContain(party.id)

    // …not the year it was submitted in, nor an unrelated year.
    const inSubmissionYear = await getScheduledParties(submissionYear)
    expect(inSubmissionYear.map((p) => p.id)).not.toContain(party.id)

    const inOther = await getScheduledParties(getNextSchoolYear(confirmedYear))
    expect(inOther.map((p) => p.id)).not.toContain(party.id)
  })

  it('excludes still-pending (NEW) parties', async () => {
    const admin = await createAdmin()
    const form = validParty()
    await submitPartyInquiry(form)
    const party = await db.inquiry.findFirstOrThrow({ where: { parentEmail: form.parentEmail } })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const rows = await getScheduledParties(party.schoolYear ?? computeSchoolYear())
    expect(rows.map((p) => p.id)).not.toContain(party.id)
  })
})

describe('getInquiries — type filter', () => {
  it('separates party and course inquiries by type', async () => {
    const admin = await createAdmin()
    const year = computeSchoolYear()
    const marker = `PTYPE${Date.now().toString(36)}`

    const partyForm = validParty({ parentLastName: marker })
    await submitPartyInquiry(partyForm)
    const course = await createInquiry({ parentName: `${marker} Tecaj`, schoolYear: year })

    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie(year)

    const partyOnly = await getInquiries({ type: 'PARTY', search: marker })
    const partyIds = partyOnly.data.map((i) => i.id)
    expect(partyIds).not.toContain(course.id)
    expect(partyOnly.data.every((i) => i.type === 'PARTY')).toBe(true)

    const courseOnly = await getInquiries({ type: 'COURSE', search: marker })
    const courseIds = courseOnly.data.map((i) => i.id)
    expect(courseIds).toContain(course.id)
    expect(courseOnly.data.every((i) => i.type === 'COURSE')).toBe(true)
  })
})
