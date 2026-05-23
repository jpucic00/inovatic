import { describe, expect, it } from 'vitest'
import { declineInquirySchema } from '@/lib/validators/admin/inquiry'

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
