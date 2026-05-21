import { describe, expect, it } from 'vitest'
import { bulkMarkSessionSchema } from '@/lib/validators/attendance'

describe('bulkMarkSessionSchema', () => {
  it('accepts a valid bulk-mark payload', () => {
    const result = bulkMarkSessionSchema.parse({
      groupId: 'g1',
      sessionDate: '2026-05-15',
      entries: [
        { enrollmentId: 'e1', present: true, note: null },
        { enrollmentId: 'e2', present: false, note: 'bolestan' },
      ],
    })
    expect(result.entries).toHaveLength(2)
  })

  it('accepts entry with empty-string note', () => {
    const result = bulkMarkSessionSchema.parse({
      groupId: 'g1',
      sessionDate: '2026-05-15',
      entries: [{ enrollmentId: 'e1', present: true, note: '' }],
    })
    expect(result.entries[0].note).toBe('')
  })

  it('accepts entry with omitted note', () => {
    const result = bulkMarkSessionSchema.parse({
      groupId: 'g1',
      sessionDate: '2026-05-15',
      entries: [{ enrollmentId: 'e1', present: true }],
    })
    expect(result.entries[0].note).toBeUndefined()
  })

  it('rejects malformed sessionDate (not YYYY-MM-DD)', () => {
    const result = bulkMarkSessionSchema.safeParse({
      groupId: 'g1',
      sessionDate: '15.05.2026',
      entries: [{ enrollmentId: 'e1', present: true }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('YYYY-MM-DD')
    }
  })

  it('rejects empty entries array', () => {
    const result = bulkMarkSessionSchema.safeParse({
      groupId: 'g1',
      sessionDate: '2026-05-15',
      entries: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('barem jedan')
    }
  })

  it('rejects note longer than 500 chars', () => {
    const result = bulkMarkSessionSchema.safeParse({
      groupId: 'g1',
      sessionDate: '2026-05-15',
      entries: [{ enrollmentId: 'e1', present: true, note: 'x'.repeat(501) }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty groupId', () => {
    const result = bulkMarkSessionSchema.safeParse({
      groupId: '',
      sessionDate: '2026-05-15',
      entries: [{ enrollmentId: 'e1', present: true }],
    })
    expect(result.success).toBe(false)
  })
})
