import { describe, expect, it } from 'vitest'
import {
  previewEmailSchema,
  previewRecipientsSchema,
  sendEmailCampaignSchema,
} from '@/lib/validators/admin/email-campaign'

const baseFilters = {
  sourceSchoolYear: '2025/2026',
  sourceGroupIds: ['g1', 'g2'],
}

const content = {
  subject: 'Upisi u školsku godinu 2026/2027 – Inovatic',
  bodyText: 'Pozivamo vas na upis u novu školsku godinu.',
}

describe('sendEmailCampaignSchema', () => {
  it('accepts a CUSTOM campaign without any target fields', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'CUSTOM',
      ...baseFilters,
      ...content,
      excludedParentEmails: ['mama@test.hr'],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a REENROLLMENT campaign without target groups', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'REENROLLMENT',
      ...baseFilters,
      ...content,
      targetCourseId: 'c1',
      targetGroupIds: [],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an empty source-group selection', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'CUSTOM',
      ...baseFilters,
      sourceGroupIds: [],
      ...content,
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a malformed school year', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'CUSTOM',
      ...baseFilters,
      sourceSchoolYear: '2026',
      ...content,
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a too-short subject and body', () => {
    expect(
      sendEmailCampaignSchema.safeParse({
        kind: 'CUSTOM',
        ...baseFilters,
        subject: 'Hej',
        bodyText: 'kratko',
      }).success,
    ).toBe(false)
  })
})

describe('selection modes (groups vs preporuka)', () => {
  it('accepts a preporuka-only selection (specials and course:<id> entries)', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'CUSTOM',
      sourceSchoolYear: '2025/2026',
      recommendations: ['COMPETITION_PREP', 'course:abc123'],
      ...content,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects when neither groups nor preporuka are selected', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'CUSTOM',
      sourceSchoolYear: '2025/2026',
      ...content,
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects when both groups and preporuka are selected', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'REENROLLMENT',
      ...baseFilters,
      recommendations: ['COMPETITION_PREP'],
      targetCourseId: 'c1',
      targetGroupIds: ['g1'],
      ...content,
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects undecodable recommendation values (unknown kind, bare COURSE, empty course id)', () => {
    for (const bad of ['NEPOSTOJI', 'COURSE', 'course:']) {
      const parsed = previewRecipientsSchema.safeParse({
        kind: 'CUSTOM',
        sourceSchoolYear: '2025/2026',
        recommendations: [bad],
      })
      expect(parsed.success).toBe(false)
    }
  })
})

describe('previewRecipientsSchema', () => {
  it('accepts filters with an optional target course', () => {
    expect(
      previewRecipientsSchema.safeParse({ kind: 'REENROLLMENT', ...baseFilters, targetCourseId: 'c1' })
        .success,
    ).toBe(true)
    expect(previewRecipientsSchema.safeParse({ kind: 'CUSTOM', ...baseFilters }).success).toBe(true)
  })
})

describe('previewEmailSchema', () => {
  it('needs no cohort filters — content only', () => {
    expect(previewEmailSchema.safeParse({ kind: 'CUSTOM', ...content }).success).toBe(true)
    expect(
      previewEmailSchema.safeParse({
        kind: 'REENROLLMENT',
        ...content,
        targetCourseId: 'c1',
        targetGroupIds: ['g1'],
      }).success,
    ).toBe(true)
  })
})
