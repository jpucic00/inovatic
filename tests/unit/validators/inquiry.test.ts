import { describe, expect, it } from 'vitest'
import { inquirySchema } from '@/lib/validators/inquiry'

const baseInquiry = {
  parentName: 'Marija Horvat',
  parentEmail: 'marija@example.com',
  parentPhone: '0911234567',
  childFirstName: 'Luka',
  childLastName: 'Horvat',
  childDateOfBirth: '2015-06-15',
  childSchool: 'OŠ Split',
  grade: '4',
  consent: true as const,
}

describe('inquirySchema', () => {
  it('accepts a minimal valid inquiry', () => {
    const result = inquirySchema.parse(baseInquiry)
    expect(result.parentName).toBe('Marija Horvat')
    expect(result.consent).toBe(true)
  })

  it('accepts optional courseId, scheduledGroupId, message, referralSource', () => {
    const result = inquirySchema.parse({
      ...baseInquiry,
      courseId: 'c1',
      scheduledGroupId: 'g1',
      message: 'Pitanje',
      referralSource: 'Google',
    })
    expect(result.scheduledGroupId).toBe('g1')
    expect(result.referralSource).toBe('Google')
  })

  it('rejects short parentName', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, parentName: 'M' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('parentName')
    }
  })

  it('rejects invalid parentEmail', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, parentEmail: 'not-an-email' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('parentEmail')
    }
  })

  it('rejects parentPhone shorter than 9 chars', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, parentPhone: '12345' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('parentPhone')
    }
  })

  it('rejects when consent is false', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, consent: false })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'consent')
      expect(issue?.message).toBe('Morate pristati na obradu osobnih podataka.')
    }
  })

  it('rejects message longer than 1000 chars', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, message: 'x'.repeat(1001) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'message')
      expect(issue?.message).toContain('1000')
    }
  })

  it('rejects empty grade', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, grade: '' })
    expect(result.success).toBe(false)
  })
})
