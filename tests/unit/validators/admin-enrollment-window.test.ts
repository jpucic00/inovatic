import { describe, expect, it } from 'vitest'
import { upsertEnrollmentWindowSchema } from '@/lib/validators/admin/enrollment-window'

const base = { courseId: 'c1', schoolYear: '2026/2027' }

describe('upsertEnrollmentWindowSchema', () => {
  it('accepts a full window', () => {
    const res = upsertEnrollmentWindowSchema.safeParse({
      ...base,
      enrollmentStart: '2026-08-01',
      enrollmentEnd: '2026-09-30',
    })
    expect(res.success).toBe(true)
  })

  it('accepts both dates empty (clears/closes the window)', () => {
    const res = upsertEnrollmentWindowSchema.safeParse({
      ...base,
      enrollmentStart: '',
      enrollmentEnd: '',
    })
    expect(res.success).toBe(true)
  })

  it('accepts omitted dates', () => {
    expect(upsertEnrollmentWindowSchema.safeParse(base).success).toBe(true)
  })

  it('rejects start without end', () => {
    const res = upsertEnrollmentWindowSchema.safeParse({ ...base, enrollmentStart: '2026-08-01' })
    expect(res.success).toBe(false)
  })

  it('rejects end without start', () => {
    const res = upsertEnrollmentWindowSchema.safeParse({ ...base, enrollmentEnd: '2026-09-30' })
    expect(res.success).toBe(false)
  })

  it('rejects end before start', () => {
    const res = upsertEnrollmentWindowSchema.safeParse({
      ...base,
      enrollmentStart: '2026-09-30',
      enrollmentEnd: '2026-08-01',
    })
    expect(res.success).toBe(false)
  })

  it('rejects a malformed school year', () => {
    const res = upsertEnrollmentWindowSchema.safeParse({ ...base, schoolYear: '2026' })
    expect(res.success).toBe(false)
  })
})
