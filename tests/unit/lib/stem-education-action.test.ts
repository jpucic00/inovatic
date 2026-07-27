import { beforeEach, describe, expect, it, vi } from 'vitest'

// The action orchestrates two senders and touches neither Prisma nor auth(), so
// mocking the mail service is enough to pin its whole contract.
const { sendInquiry, sendConfirmation } = vi.hoisted(() => ({
  sendInquiry: vi.fn(),
  sendConfirmation: vi.fn(),
}))
vi.mock('@/lib/email', () => ({
  sendStemEducationInquiryEmail: sendInquiry,
  sendStemEducationConfirmationEmail: sendConfirmation,
}))

// The action reads the caller's IP for rate limiting; give every test its own
// so the limiter never bleeds across cases.
let currentIp = '203.0.113.1'
vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', currentIp]]),
}))

import { submitStemEducationInquiry } from '@/actions/stem-education'
import { resetRateLimits } from '@/lib/rate-limit'
import type { StemEducationInquiryFormData } from '@/lib/validators/stem-education'

const valid: StemEducationInquiryFormData = {
  contactName: 'Ivana Ivić',
  institutionName: 'OŠ Meje',
  institutionType: 'OSNOVNA_SKOLA',
  email: 'ravnatelj@os-meje.hr',
  phone: '099 123 4567',
  services: ['OSNOVNA_EDUKACIJA'],
  trainingPlace: 'USTANOVA_NARUCITELJA',
  message: 'Zanima nas edukacija za dva mentora.',
  consent: true,
}

describe('submitStemEducationInquiry', () => {
  let ipCounter = 0
  beforeEach(() => {
    sendInquiry.mockReset().mockResolvedValue(true)
    sendConfirmation.mockReset().mockResolvedValue(true)
    resetRateLimits()
    currentIp = `203.0.113.${++ipCounter}`
  })

  it('sends the notification with resolved Croatian labels, then the confirmation', async () => {
    const res = await submitStemEducationInquiry(valid)

    expect(res).toEqual({ success: true })
    expect(sendInquiry).toHaveBeenCalledTimes(1)
    // The validator's label maps are the single source of truth — the email must
    // carry the Croatian labels, never the raw enum keys.
    expect(sendInquiry.mock.calls[0][0]).toMatchObject({
      institutionType: 'Osnovna škola',
      services: ['Osnovna edukacija mentora'],
    })
    expect(sendConfirmation).toHaveBeenCalledTimes(1)
    expect(sendConfirmation.mock.calls[0][0]).toMatchObject({ to: valid.email })
  })

  it('surfaces a failed notification and never sends the courtesy copy', async () => {
    sendInquiry.mockRejectedValue(new Error('resend down'))

    const res = await submitStemEducationInquiry(valid)

    expect(res.success).toBe(false)
    expect(sendConfirmation).not.toHaveBeenCalled()
  })

  // This form persists nothing, so a `false` return (RESEND_API_KEY unset) loses
  // the only copy of the inquiry — it must read as a failure, not a success.
  it('fails when the notification sender no-ops instead of sending', async () => {
    sendInquiry.mockResolvedValue(false)

    const res = await submitStemEducationInquiry(valid)

    expect(res.success).toBe(false)
    expect(sendConfirmation).not.toHaveBeenCalled()
  })

  it('still succeeds when only the courtesy confirmation fails', async () => {
    sendConfirmation.mockRejectedValue(new Error('bad recipient'))

    const res = await submitStemEducationInquiry(valid)

    expect(res).toEqual({ success: true })
    expect(sendInquiry).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid input without attempting any send', async () => {
    const res = await submitStemEducationInquiry({ ...valid, services: [] })

    expect(res.success).toBe(false)
    expect(sendInquiry).not.toHaveBeenCalled()
    expect(sendConfirmation).not.toHaveBeenCalled()
  })

  // The inbox IS the record for this form, so flooding it destroys the only
  // channel real inquiries arrive on.
  describe('abuse guards', () => {
    it('reports success but sends nothing when the honeypot is filled', async () => {
      const res = await submitStemEducationInquiry({ ...valid, website: 'http://spam.example' })

      expect(res).toEqual({ success: true })
      expect(sendInquiry).not.toHaveBeenCalled()
      expect(sendConfirmation).not.toHaveBeenCalled()
    })

    it('ignores an empty honeypot', async () => {
      expect(await submitStemEducationInquiry({ ...valid, website: '   ' })).toEqual({
        success: true,
      })
      expect(sendInquiry).toHaveBeenCalledTimes(1)
    })

    it('throttles one address after repeated submissions', async () => {
      // Vary the IP so the per-email bucket is what actually trips.
      for (let i = 0; i < 3; i++) {
        currentIp = `198.51.100.${i}`
        expect((await submitStemEducationInquiry(valid)).success).toBe(true)
      }
      currentIp = '198.51.100.9'
      const blocked = await submitStemEducationInquiry(valid)

      expect(blocked.success).toBe(false)
      expect(blocked.success === false && blocked.error).toMatch(/previše upita/)
      expect(sendInquiry).toHaveBeenCalledTimes(3)
    })

    it('throttles one IP cycling through addresses', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await submitStemEducationInquiry({ ...valid, email: `skola${i}@test.hr` })
        expect(res.success).toBe(true)
      }
      const blocked = await submitStemEducationInquiry({ ...valid, email: 'skola9@test.hr' })

      expect(blocked.success).toBe(false)
      expect(sendInquiry).toHaveBeenCalledTimes(5)
    })

    it('matches addresses case-insensitively', async () => {
      for (let i = 0; i < 3; i++) {
        currentIp = `192.0.2.${i}`
        await submitStemEducationInquiry({ ...valid, email: 'Ravnatelj@OS-Meje.hr' })
      }
      currentIp = '192.0.2.9'
      const blocked = await submitStemEducationInquiry({ ...valid, email: 'ravnatelj@os-meje.hr' })

      expect(blocked.success).toBe(false)
    })
  })
})
