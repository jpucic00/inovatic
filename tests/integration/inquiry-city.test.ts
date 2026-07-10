import { describe, expect, it, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { createGroup } from './helpers/factory'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import type { InquiryFormData } from '@/lib/validators/inquiry'

// submitInquiry / submitPartyInquiry send a confirmation email when
// RESEND_API_KEY is set — the test environment must not talk to Resend.
beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

const { submitInquiry, submitPartyInquiry } = await import('@/actions/inquiry')

let emailCounter = 0
const uniqueEmail = () => `city-${Date.now().toString(36)}-${++emailCounter}@test.local`

function validForm(overrides: Partial<InquiryFormData> = {}): InquiryFormData {
  return {
    city: 'SPLIT',
    parentName: 'Test Roditelj',
    parentEmail: uniqueEmail(),
    parentPhone: '+385912345678',
    childFirstName: 'Dijete',
    childLastName: 'Test',
    childDateOfBirth: '2015-06-12',
    grade: GRADE_VALUES[0],
    consent: true,
    ...overrides,
  }
}

describe('submitInquiry — city persistence and cross-city verification', () => {
  it('persists the submitted city (Šibenik) on a group-less inquiry', async () => {
    const form = validForm({ city: 'SIBENIK' })
    const res = await submitInquiry(form)
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.city).toBe('SIBENIK')
  })

  it('accepts a group in the same city as the submitted city', async () => {
    const group = await createGroup({ city: 'SIBENIK' })
    const form = validForm({ city: 'SIBENIK', scheduledGroupId: group.id })

    const res = await submitInquiry(form)
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created?.city).toBe('SIBENIK')
    expect(created?.scheduledGroupId).toBe(group.id)
  })

  it('rejects a group whose city differs from the submitted city, and files no inquiry', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT' })
    // Submit for Šibenik but point at a Split group — the client never offers
    // this pairing, so it can only be a stale/tampered payload.
    const form = validForm({ city: 'SIBENIK', scheduledGroupId: splitGroup.id })

    const res = await submitInquiry(form)
    expect(res.success).toBe(false)

    const created = await db.inquiry.findFirst({ where: { parentEmail: form.parentEmail } })
    expect(created).toBeNull()
  })
})

describe('submitPartyInquiry — Split-only', () => {
  it('stamps city = SPLIT server-side (party form has no city field)', async () => {
    const email = uniqueEmail()
    const res = await submitPartyInquiry({
      parentFirstName: 'Ana',
      parentLastName: 'Horvat',
      parentPhone: '+385912345678',
      parentEmail: email,
      message: 'Proslava za osmero djece.',
      consent: true,
    })
    expect(res.success).toBe(true)

    const created = await db.inquiry.findFirst({ where: { parentEmail: email } })
    expect(created?.type).toBe('PARTY')
    expect(created?.city).toBe('SPLIT')
  })
})
