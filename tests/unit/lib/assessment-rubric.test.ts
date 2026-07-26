import { describe, expect, it } from 'vitest'
import {
  SKILL_CATEGORIES,
  SKILL_KEYS,
  SKILL_LEVELS,
  decodeRecommendation,
  encodeRecommendation,
  formatRecommendationLabel,
} from '@/lib/assessment-rubric'

describe('encode/decodeRecommendation', () => {
  it('round-trips a course recommendation', () => {
    const enc = encodeRecommendation('COURSE', 'c123')
    expect(enc).toBe('course:c123')
    expect(decodeRecommendation(enc)).toEqual({
      recommendationKind: 'COURSE',
      recommendedCourseId: 'c123',
    })
  })

  it('round-trips competition specials (no courseId)', () => {
    for (const kind of ['COMPETITION_PREP', 'COMPETITION_PROGRAM'] as const) {
      const enc = encodeRecommendation(kind, null)
      expect(enc).toBe(kind)
      expect(decodeRecommendation(enc)).toEqual({
        recommendationKind: kind,
        recommendedCourseId: null,
      })
    }
  })

  it('encodes to empty for no recommendation or COURSE without an id', () => {
    expect(encodeRecommendation(null, null)).toBe('')
    expect(encodeRecommendation('COURSE', null)).toBe('')
  })

  it('decodes empty and malformed values to no recommendation', () => {
    expect(decodeRecommendation('')).toEqual({
      recommendationKind: null,
      recommendedCourseId: null,
    })
    expect(decodeRecommendation('course:')).toEqual({
      recommendationKind: null,
      recommendedCourseId: null,
    })
    expect(decodeRecommendation('nonsense')).toEqual({
      recommendationKind: null,
      recommendedCourseId: null,
    })
  })
})

describe('formatRecommendationLabel', () => {
  it('uses the recommended course title for COURSE', () => {
    expect(formatRecommendationLabel('COURSE', 'Svijet LEGO Robotike 3')).toBe(
      'Svijet LEGO Robotike 3',
    )
  })

  it('falls back to a generic label when the COURSE title is missing', () => {
    expect(formatRecommendationLabel('COURSE', null)).toBe('Preporučen program')
  })

  it('maps the special tracks to their canonical Croatian labels', () => {
    expect(formatRecommendationLabel('COMPETITION_PREP', null)).toBe('Priprema za natjecanja')
    expect(formatRecommendationLabel('COMPETITION_PROGRAM', null)).toBe('Natjecateljski program')
  })
})

describe('rubric shape', () => {
  it('has exactly the 6 skills of SKILL_KEYS across the 2 categories', () => {
    const keys = SKILL_CATEGORIES.flatMap((c) => c.skills.map((s) => s.key))
    expect(keys).toEqual([...SKILL_KEYS])
    expect(keys).toHaveLength(6)
  })

  it('exposes the three grading levels', () => {
    expect([...SKILL_LEVELS]).toEqual(['POCETNO', 'U_RAZVOJU', 'OSTVARENO'])
  })
})
