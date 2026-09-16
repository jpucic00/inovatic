import { describe, expect, it } from 'vitest'
import {
  previewEmailSchema,
  previewEvaluationRecipientSchema,
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

/**
 * The formatted body is checked by the SAME normalizer the send stores with,
 * on every schema that carries content. Each case below would pass with the
 * `.superRefine(validateBody)` hook removed from one schema, which is exactly
 * the drift this guards against.
 */
describe('formatted body (bodyBlocks) on every content schema', () => {
  const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text, styles: {} }] })
  const cases: [string, (input: Record<string, unknown>) => { success: boolean; error?: unknown }][] = [
    ['sendEmailCampaignSchema', (i) => sendEmailCampaignSchema.safeParse({ kind: 'CUSTOM', ...baseFilters, ...i })],
    ['previewEmailSchema', (i) => previewEmailSchema.safeParse({ kind: 'CUSTOM', ...i })],
    [
      'previewEvaluationRecipientSchema',
      (i) => previewEvaluationRecipientSchema.safeParse({ kind: 'EVALUATION', ...baseFilters, assessmentId: 'a1', ...i }),
    ],
  ]

  it.each(cases)('%s: measures the limit on the flattened blocks, not on the short bodyText beside them', (_, parse) => {
    const res = parse({ ...content, bodyBlocks: [para('x'.repeat(5001))] })
    expect(res.success).toBe(false)
    const issues = (res as { error?: { issues: { path: unknown[]; message: string }[] } }).error?.issues ?? []
    expect(issues.some((i) => i.path[0] === 'bodyText' && i.message === 'Maksimalno 5000 znakova.')).toBe(true)
  })

  it.each(cases)('%s: refuses blocks that leave nothing behind even when bodyText looks fine', (_, parse) => {
    expect(parse({ ...content, bodyBlocks: [{ type: 'image', props: { url: 'x' } }] }).success).toBe(false)
  })

  it.each(cases)('%s: bounds the payload before the walk', (_, parse) => {
    expect(parse({ ...content, bodyBlocks: Array.from({ length: 2001 }, () => para('a')) }).success).toBe(false)
  })

  it.each(cases)('%s: still accepts a plain-text-only payload and a well-formed formatted one', (_, parse) => {
    expect(parse({ ...content }).success).toBe(true)
    expect(parse({ ...content, bodyBlocks: [para('Pozivamo vas na upis u novu školsku godinu.')] }).success).toBe(true)
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

  it('rejects an EVALUATION campaign selected by preporuka — a preporuka names children, not cards', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'EVALUATION',
      sourceSchoolYear: '2025/2026',
      recommendations: ['COMPETITION_PROGRAM'],
      ...content,
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe('Evaluacije se šalju odabirom grupa.')
    }
  })

  it('accepts an EVALUATION campaign by groups with per-card exclusions', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'EVALUATION',
      ...baseFilters,
      ...content,
      excludedAssessmentIds: ['assessment-1'],
    })
    expect(parsed.success).toBe(true)
  })
})

describe('SCHEDULE campaign', () => {
  it('accepts a group selection with per-address exclusions — a row is one inbox', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'SCHEDULE',
      ...baseFilters,
      ...content,
      excludedParentEmails: ['obitelj@example.hr'],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a preporuka selection — a schedule lists the groups a child is IN', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'SCHEDULE',
      sourceSchoolYear: '2025/2026',
      recommendations: ['COMPETITION_PROGRAM'],
      ...content,
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe('Termini se šalju odabirom grupa.')
    }
  })

  it('rejects individually picked children — that mode is CREDENTIALS-only', () => {
    const parsed = sendEmailCampaignSchema.safeParse({
      kind: 'SCHEDULE',
      sourceSchoolYear: '2025/2026',
      sourceStudentIds: ['s1'],
      ...content,
    })
    expect(parsed.success).toBe(false)
  })

  it('previews with content only, like every other kind', () => {
    expect(previewEmailSchema.safeParse({ kind: 'SCHEDULE', ...content }).success).toBe(true)
    expect(
      previewRecipientsSchema.safeParse({ kind: 'SCHEDULE', ...baseFilters }).success,
    ).toBe(true)
  })
})
