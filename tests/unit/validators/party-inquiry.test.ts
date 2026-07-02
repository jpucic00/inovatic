import { describe, expect, it } from 'vitest'
import { partyInquirySchema } from '@/lib/validators/inquiry'
import { schedulePartySchema } from '@/lib/validators/admin/inquiry'

const baseParty = {
  parentFirstName: 'Ana',
  parentLastName: 'Horvat',
  parentPhone: '0911234567',
  parentEmail: 'ana@example.com',
  message: 'Željeli bismo proslavu za osmero djece.',
  consent: true as const,
}

describe('partyInquirySchema', () => {
  it('accepts a minimal valid party inquiry (no proposed date)', () => {
    const result = partyInquirySchema.parse(baseParty)
    expect(result.parentFirstName).toBe('Ana')
    expect(result.consent).toBe(true)
  })

  it('accepts a valid YYYY-MM-DD proposed date', () => {
    const result = partyInquirySchema.parse({ ...baseParty, partyProposedDate: '2026-07-15' })
    expect(result.partyProposedDate).toBe('2026-07-15')
  })

  it('accepts an empty-string proposed date (cleared field)', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, partyProposedDate: '' })
    expect(result.success).toBe(true)
  })

  it('rejects a malformed proposed date', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, partyProposedDate: '15.07.2026' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === 'partyProposedDate')).toBeDefined()
    }
  })

  it('rejects a short parentFirstName', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, parentFirstName: 'A' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toContain('parentFirstName')
  })

  it('rejects a short parentLastName', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, parentLastName: 'H' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toContain('parentLastName')
  })

  it('rejects an invalid email', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, parentEmail: 'nope' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toContain('parentEmail')
  })

  it('rejects a phone shorter than 9 chars', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, parentPhone: '12345' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toContain('parentPhone')
  })

  it('rejects a message shorter than 5 chars', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, message: 'hi' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toContain('message')
  })

  it('rejects a message longer than 1000 chars', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, message: 'x'.repeat(1001) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'message')
      expect(issue?.message).toContain('1000')
    }
  })

  it('rejects when consent is false', () => {
    const result = partyInquirySchema.safeParse({ ...baseParty, consent: false })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'consent')
      expect(issue?.message).toBe('Morate pristati na obradu osobnih podataka.')
    }
  })
})

describe('schedulePartySchema', () => {
  const base = { id: 'inq1', confirmedDate: '2026-07-15', startTime: '17:00' }

  it('accepts a valid date + HH:mm time', () => {
    const result = schedulePartySchema.parse(base)
    expect(result.confirmedDate).toBe('2026-07-15')
    expect(result.startTime).toBe('17:00')
  })

  it('rejects an empty id', () => {
    expect(schedulePartySchema.safeParse({ ...base, id: '' }).success).toBe(false)
  })

  it('rejects a malformed date', () => {
    expect(schedulePartySchema.safeParse({ ...base, confirmedDate: '2026/07/15' }).success).toBe(false)
  })

  it.each(['25:00', '7:5', '1700', '17:60'])('rejects an invalid time %s', (startTime) => {
    expect(schedulePartySchema.safeParse({ ...base, startTime }).success).toBe(false)
  })
})
