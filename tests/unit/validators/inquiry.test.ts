import { describe, expect, it } from 'vitest'
import { inquirySchema } from '@/lib/validators/inquiry'

const baseInquiry = {
  city: 'SPLIT' as const,
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

  it('rejects the legacy workshop sentinel value', () => {
    // Pre-1bf0212 radionica forms posted grade='workshop' as a sentinel.
    // After the sentinel removal, every flow (including /radionice) must
    // submit a real canonical grade. A regression that re-introduces
    // grade='workshop' as a default would slip past unit tests if this
    // case were not pinned.
    const result = inquirySchema.safeParse({ ...baseInquiry, grade: 'workshop' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'grade')
      expect(issue).toBeDefined()
    }
  })

  it('rejects an omitted grade key entirely', () => {
    const { grade: _grade, ...withoutGrade } = baseInquiry
    void _grade
    const result = inquirySchema.safeParse(withoutGrade)
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'grade')
      expect(issue).toBeDefined()
    }
  })

  it('accepts predskolci (preschool — the first GRADE_VALUES entry)', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, grade: 'predskolci' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.grade).toBe('predskolci')
  })

  it('accepts SIBENIK as a city', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, city: 'SIBENIK' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.city).toBe('SIBENIK')
  })

  it('rejects a missing city with the Croatian error message', () => {
    const { city: _city, ...withoutCity } = baseInquiry
    void _city
    const result = inquirySchema.safeParse(withoutCity)
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'city')
      expect(issue?.message).toBe('Odaberite grad')
    }
  })

  it('rejects an empty-string city (the no-default placeholder value)', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, city: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'city')
      expect(issue?.message).toBe('Odaberite grad')
    }
  })

  it('rejects an unknown city value', () => {
    const result = inquirySchema.safeParse({ ...baseInquiry, city: 'ZAGREB' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'city')
      expect(issue).toBeDefined()
    }
  })

  // The termin question has two possible answers, and the dropdown can only
  // produce one of them at a time.
  it('accepts the "predloženi termin ne odgovara" answer with no group', () => {
    const result = inquirySchema.safeParse({
      ...baseInquiry,
      courseId: 'c1',
      noSuitableTermin: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.noSuitableTermin).toBe(true)
      expect(result.data.scheduledGroupId).toBeUndefined()
    }
  })

  it('rejects a payload claiming both a chosen termin and that none suits', () => {
    const result = inquirySchema.safeParse({
      ...baseInquiry,
      courseId: 'c1',
      scheduledGroupId: 'g1',
      noSuitableTermin: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'scheduledGroupId')
      expect(issue?.message).toBe(
        'Odaberite termin ili označite da vam predloženi termin ne odgovara.',
      )
    }
  })

  it('leaves the flag unset on an ordinary inquiry', () => {
    const result = inquirySchema.parse({ ...baseInquiry, scheduledGroupId: 'g1' })
    expect(result.noSuitableTermin).toBeUndefined()
  })
})
