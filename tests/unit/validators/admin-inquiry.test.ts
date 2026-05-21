import { describe, expect, it } from 'vitest'
import { InquiryStatus } from '@prisma/client'
import { updateStatusSchema } from '@/lib/validators/admin/inquiry'

describe('updateStatusSchema', () => {
  it.each(Object.values(InquiryStatus))('accepts %s status value', (status) => {
    const result = updateStatusSchema.parse({ id: 'i1', status })
    expect(result.status).toBe(status)
  })

  it('rejects unknown status value', () => {
    const result = updateStatusSchema.safeParse({ id: 'i1', status: 'BOGUS' })
    expect(result.success).toBe(false)
  })

  it('rejects empty id', () => {
    const result = updateStatusSchema.safeParse({ id: '', status: InquiryStatus.NEW })
    expect(result.success).toBe(false)
  })

  it('rejects missing status', () => {
    const result = updateStatusSchema.safeParse({ id: 'i1' })
    expect(result.success).toBe(false)
  })
})
