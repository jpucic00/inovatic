import { describe, expect, it } from 'vitest'
import type { City, SkillLevel } from '@prisma/client'
import {
  assertCardsBelongTo,
  toEvaluationCard,
  type CardOwnership,
  type EvaluationCardRow,
} from '@/lib/evaluation-email-cards'
import {
  isBlankAssessment,
  isCompleteAssessment,
  SKILL_LEVELS,
  SKILL_LEVEL_BADGE_CLASS,
  SKILL_LEVEL_BADGE_STYLE,
} from '@/lib/assessment-rubric'

function cardRow(overrides: Partial<EvaluationCardRow> = {}): EvaluationCardRow {
  return {
    id: 'card-1',
    slaganje: 'OSTVARENO',
    programiranje: 'U_RAZVOJU',
    razradaIdeja: null,
    izvedivost: null,
    inovacije: 'OSTVARENO',
    suradnja: 'OSTVARENO',
    komunikacija: 'U_RAZVOJU',
    zabava: 'POCETNO',
    opisnaOcjena: 'Lijep napredak.',
    recommendationKind: 'COURSE',
    recommendedCourse: { title: 'Svijet LEGO robotike 3' },
    updatedAt: new Date('2026-06-30T10:00:00Z'),
    author: { firstName: 'Ana', lastName: 'Mentor' },
    student: { firstName: 'Iva', lastName: 'Horvat' },
    group: { name: 'SLR 2 – utorkom', course: { title: 'Svijet LEGO robotike 2', kind: 'STANDARD' } },
    ...overrides,
  }
}

function ownership(overrides: Partial<CardOwnership> = {}): CardOwnership {
  return {
    id: 'card-1',
    student: { parentEmail: 'roditelj@test.hr' },
    group: { city: 'SPLIT' as City },
    ...overrides,
  }
}

const EXPECTED = { parentEmail: 'roditelj@test.hr', city: 'SPLIT' as City, assessmentIds: ['card-1'] }

describe('toEvaluationCard', () => {
  it('resolves ids to display strings and keeps the group’s rubric kind', () => {
    const card = toEvaluationCard(cardRow())
    expect(card.childName).toBe('Iva Horvat')
    expect(card.groupLabel).toBe('SLR 2 – utorkom · Svijet LEGO robotike 2')
    expect(card.kind).toBe('STANDARD')
    expect(card.recommendationLabel).toBe('Svijet LEGO robotike 3')
    expect(card.authorName).toBe('Ana Mentor')
    expect(card.updatedAtLabel).toBe('30.06.2026.')
  })

  it('carries a special-track preporuka by its canonical label', () => {
    const card = toEvaluationCard(
      cardRow({ recommendationKind: 'COMPETITION_WRO', recommendedCourse: null }),
    )
    expect(card.recommendationLabel).toBe('Natjecateljski program – WRO')
  })

  it('leaves the preporuka off when there is none', () => {
    const card = toEvaluationCard(cardRow({ recommendationKind: null, recommendedCourse: null }))
    expect(card.recommendationLabel).toBeNull()
  })

  it('falls back to the program title when the group is unnamed', () => {
    const card = toEvaluationCard(
      cardRow({
        group: { name: null, course: { title: 'Natjecateljski program', kind: 'COMPETITION' } },
      }),
    )
    expect(card.groupLabel).toBe('Natjecateljski program')
    expect(card.kind).toBe('COMPETITION')
  })
})

describe('assertCardsBelongTo', () => {
  it('passes when every card’s student still lists exactly this address', () => {
    expect(assertCardsBelongTo(EXPECTED, [ownership()])).toEqual({ ok: true })
  })

  it('passes for two cards of the same parent (a child in two groups)', () => {
    const verdict = assertCardsBelongTo(
      { ...EXPECTED, assessmentIds: ['card-1', 'card-2'] },
      [ownership(), ownership({ id: 'card-2' })],
    )
    expect(verdict).toEqual({ ok: true })
  })

  it('refuses when a card belongs to a different address', () => {
    const verdict = assertCardsBelongTo(EXPECTED, [
      ownership({ student: { parentEmail: 'netko.drugi@test.hr' } }),
    ])
    expect(verdict.ok).toBe(false)
  })

  it('refuses when the stored address no longer normalizes to the row’s', () => {
    // The parent's address was corrected after the cohort was queued.
    const verdict = assertCardsBelongTo(EXPECTED, [
      ownership({ student: { parentEmail: 'roditelj+novo@test.hr' } }),
    ])
    expect(verdict.ok).toBe(false)
  })

  it('accepts the Outlook-style and mixed-case forms the app normalizes', () => {
    const verdict = assertCardsBelongTo(EXPECTED, [
      ownership({ student: { parentEmail: 'Ime Prezime <Roditelj@Test.HR>' } }),
    ])
    expect(verdict).toEqual({ ok: true })
  })

  it('refuses when the parent has no address at all', () => {
    const verdict = assertCardsBelongTo(EXPECTED, [ownership({ student: { parentEmail: null } })])
    expect(verdict.ok).toBe(false)
  })

  it('refuses a card whose group belongs to the other city', () => {
    const verdict = assertCardsBelongTo(EXPECTED, [
      ownership({ group: { city: 'SIBENIK' as City } }),
    ])
    expect(verdict.ok).toBe(false)
  })

  it('refuses when a named card no longer resolves', () => {
    const verdict = assertCardsBelongTo({ ...EXPECTED, assessmentIds: ['card-1', 'gone'] }, [
      ownership(),
    ])
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toContain('izbrisana')
  })

  it('refuses an extra card the row never named', () => {
    const verdict = assertCardsBelongTo(EXPECTED, [ownership(), ownership({ id: 'smuggled' })])
    expect(verdict.ok).toBe(false)
  })

  it('refuses a row with no cards rather than sending an empty message', () => {
    const verdict = assertCardsBelongTo({ ...EXPECTED, assessmentIds: [] }, [])
    expect(verdict.ok).toBe(false)
  })
})

describe('isBlankAssessment', () => {
  const blank = {
    slaganje: null,
    programiranje: null,
    razradaIdeja: null,
    izvedivost: null,
    inovacije: null,
    suradnja: null,
    komunikacija: null,
    zabava: null,
    opisnaOcjena: null,
    recommendationKind: null,
  }

  it('treats an untouched row as ungraded', () => {
    expect(isBlankAssessment(blank)).toBe(true)
    expect(isBlankAssessment({ ...blank, opisnaOcjena: '   ' })).toBe(true)
  })

  it('any single filled field makes it graded', () => {
    expect(isBlankAssessment({ ...blank, zabava: 'POCETNO' })).toBe(false)
    expect(isBlankAssessment({ ...blank, opisnaOcjena: 'Bravo!' })).toBe(false)
    expect(isBlankAssessment({ ...blank, recommendationKind: 'COMPETITION_PREP' })).toBe(false)
  })
})

describe('isCompleteAssessment', () => {
  const full = {
    slaganje: 'OSTVARENO' as SkillLevel,
    programiranje: 'OSTVARENO' as SkillLevel,
    razradaIdeja: null,
    izvedivost: null,
    inovacije: 'OSTVARENO' as SkillLevel,
    suradnja: 'OSTVARENO' as SkillLevel,
    komunikacija: 'OSTVARENO' as SkillLevel,
    zabava: 'OSTVARENO' as SkillLevel,
    opisnaOcjena: null,
    recommendationKind: null,
  }

  it('judges a STANDARD card on its own three practical skills', () => {
    expect(isCompleteAssessment('STANDARD', full)).toBe(true)
    expect(isCompleteAssessment('STANDARD', { ...full, zabava: null })).toBe(false)
  })

  it('does not ask a STANDARD card for the competition skills', () => {
    // razradaIdeja/izvedivost are null above and it is still complete.
    expect(isCompleteAssessment('STANDARD', full)).toBe(true)
  })

  it('judges a COMPETITION card on razrada ideja + izvedivost instead', () => {
    expect(isCompleteAssessment('COMPETITION', full)).toBe(false)
    expect(
      isCompleteAssessment('COMPETITION', {
        ...full,
        slaganje: null,
        programiranje: null,
        razradaIdeja: 'OSTVARENO',
        izvedivost: 'U_RAZVOJU',
      }),
    ).toBe(true)
  })

  it('does not require opisna ocjena or preporuka', () => {
    expect(full.opisnaOcjena).toBeNull()
    expect(full.recommendationKind).toBeNull()
    expect(isCompleteAssessment('STANDARD', full)).toBe(true)
  })
})

describe('skill level styling', () => {
  it('every level is styled for both the app and the inbox', () => {
    // Without this a new level lands styled on screen and unstyled in e-mail.
    for (const level of SKILL_LEVELS) {
      expect(SKILL_LEVEL_BADGE_CLASS[level]).toBeTruthy()
      expect(SKILL_LEVEL_BADGE_STYLE[level].backgroundColor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(SKILL_LEVEL_BADGE_STYLE[level].color).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(Object.keys(SKILL_LEVEL_BADGE_STYLE).sort()).toEqual([...SKILL_LEVELS].sort())
  })
})
