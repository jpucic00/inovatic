import { describe, expect, it } from 'vitest'
import { declineInquirySchema, waitlistInquirySchema } from '@/lib/validators/admin/inquiry'

describe('declineInquirySchema', () => {
  it('accepts a valid id + reason', () => {
    const result = declineInquirySchema.parse({
      id: 'i1',
      reason: 'Dijete je premlado za ovaj program.',
    })
    expect(result.id).toBe('i1')
    expect(result.reason).toBe('Dijete je premlado za ovaj program.')
  })

  it('trims surrounding whitespace from reason', () => {
    const result = declineInquirySchema.parse({
      id: 'i1',
      reason: '   Razlog s viškom razmaka   ',
    })
    expect(result.reason).toBe('Razlog s viškom razmaka')
  })

  it('rejects empty id', () => {
    const result = declineInquirySchema.safeParse({ id: '', reason: 'Razlog je dovoljno dug.' })
    expect(result.success).toBe(false)
  })

  it('rejects empty reason', () => {
    const result = declineInquirySchema.safeParse({ id: 'i1', reason: '' })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only reason', () => {
    const result = declineInquirySchema.safeParse({ id: 'i1', reason: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects reason shorter than 3 trimmed chars', () => {
    const result = declineInquirySchema.safeParse({ id: 'i1', reason: 'ab' })
    expect(result.success).toBe(false)
  })

  it('rejects reason longer than 2000 chars', () => {
    const result = declineInquirySchema.safeParse({
      id: 'i1',
      reason: 'a'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })

  it('accepts reason at the 2000-char boundary', () => {
    const result = declineInquirySchema.safeParse({
      id: 'i1',
      reason: 'a'.repeat(2000),
    })
    expect(result.success).toBe(true)
  })
})

describe('waitlistInquirySchema', () => {
  it('accepts groups without a note, and stores a blank note as null', () => {
    const r = waitlistInquirySchema.parse({ id: 'i1', groupIds: ['g1'], note: '   ' })
    expect(r.note).toBeNull()
    expect(r.groupIds).toEqual(['g1'])
  })

  it('accepts a note without groups, trimmed', () => {
    const r = waitlistInquirySchema.parse({ id: 'i1', groupIds: [], note: '  samo petak ' })
    expect(r.note).toBe('samo petak')
  })

  it('rejects an entry with neither groups nor a note', () => {
    expect(waitlistInquirySchema.safeParse({ id: 'i1', groupIds: [], note: '  ' }).success).toBe(false)
  })

  it('dedupes group ids and caps them at 20', () => {
    expect(waitlistInquirySchema.parse({ id: 'i1', groupIds: ['g', 'g'], note: '' }).groupIds).toEqual(['g'])
    const many = Array.from({ length: 21 }, (_, i) => `g${i}`)
    expect(waitlistInquirySchema.safeParse({ id: 'i1', groupIds: many, note: '' }).success).toBe(false)
  })

  it('caps the note at 1000 characters', () => {
    expect(
      waitlistInquirySchema.safeParse({ id: 'i1', groupIds: [], note: 'a'.repeat(1001) }).success,
    ).toBe(false)
  })
})
