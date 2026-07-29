import { describe, expect, it } from 'vitest'
import { RecommendationKind } from '@prisma/client'
import {
  RECOMMENDATION_SPECIALS,
  skillCategories,
  skillKeysFor,
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
    expect(formatRecommendationLabel('COMPETITION_FLL', null)).toBe(
      'Natjecateljski program – FLL',
    )
    expect(formatRecommendationLabel('COMPETITION_WRO', null)).toBe(
      'Natjecateljski program – WRO',
    )
  })

  it('gives every non-COURSE RecommendationKind a special-track entry', () => {
    // The guard that matters: adding an enum value without a label here would
    // otherwise surface in the dropdown as the raw enum name, and
    // encode/decodeRecommendation would silently drop it on the way through.
    const labelled = new Set(RECOMMENDATION_SPECIALS.map((s) => s.kind))
    for (const kind of Object.values(RecommendationKind)) {
      if (kind === 'COURSE') continue
      expect(labelled).toContain(kind)
    }
    expect(labelled.size).toBe(Object.values(RecommendationKind).length - 1)
  })

  it('round-trips every special track through encode/decode', () => {
    for (const { kind } of RECOMMENDATION_SPECIALS) {
      expect(encodeRecommendation(kind, null)).toBe(kind)
      expect(decodeRecommendation(kind)).toEqual({
        recommendationKind: kind,
        recommendedCourseId: null,
      })
    }
  })
})

describe('rubric shape', () => {
  it('grades a standard program on six skills across two categories', () => {
    const cats = skillCategories('STANDARD')
    expect(cats.map((c) => c.title)).toEqual(['Praktične vještine', 'Timske vještine'])
    expect(skillKeysFor('STANDARD')).toEqual([
      'slaganje',
      'programiranje',
      'inovacije',
      'suradnja',
      'komunikacija',
      'zabava',
    ])
  })

  it('swaps only the practical skills for a competition program', () => {
    const cats = skillCategories('COMPETITION')
    expect(cats.map((c) => c.title)).toEqual(['Praktične vještine', 'Timske vještine'])
    expect(skillKeysFor('COMPETITION')).toEqual([
      'razradaIdeja',
      'izvedivost',
      'inovacije',
      'suradnja',
      'komunikacija',
      'zabava',
    ])
    // Timske vještine are identical in both rubrics — same objects, so the
    // labels and descriptions cannot drift apart.
    expect(cats[1]).toBe(skillCategories('STANDARD')[1])
  })

  it('gives every skill of either rubric a label and a description', () => {
    for (const kind of ['STANDARD', 'COMPETITION'] as const) {
      for (const c of skillCategories(kind)) {
        for (const skill of c.skills) {
          expect(skill.label.length).toBeGreaterThan(0)
          expect(skill.description.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('keeps SKILL_KEYS a superset of both rubrics — it is the column list', () => {
    for (const kind of ['STANDARD', 'COMPETITION'] as const) {
      for (const key of skillKeysFor(kind)) {
        expect(SKILL_KEYS).toContain(key)
      }
    }
    expect(SKILL_KEYS).toHaveLength(8)
  })

  it('exposes the three grading levels', () => {
    expect([...SKILL_LEVELS]).toEqual(['POCETNO', 'U_RAZVOJU', 'OSTVARENO'])
  })
})
