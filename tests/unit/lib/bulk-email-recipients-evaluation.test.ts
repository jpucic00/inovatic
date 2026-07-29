import { describe, expect, it } from 'vitest'
import {
  buildEmailRecipients,
  buildEvaluationRecipients,
  SKIP_REASON_SHORT,
  SKIP_REASON_TEXT,
  type EvaluationCandidate,
} from '@/lib/bulk-email-recipients'

function candidate(overrides: Partial<EvaluationCandidate> = {}): EvaluationCandidate {
  return {
    assessmentId: 'card-1',
    studentId: 'student-1',
    firstName: 'Iva',
    lastName: 'Horvat',
    parentEmail: 'roditelj@test.hr',
    groupLabel: 'SLR 2 – utorkom',
    complete: true,
    ...overrides,
  }
}

describe('buildEvaluationRecipients', () => {
  it('does NOT merge siblings — one row per card, so one mail per child', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate(),
      candidate({ assessmentId: 'card-2', studentId: 'student-2', firstName: 'Luka' }),
    ])

    expect(recipients).toHaveLength(2)
    expect(recipients.every((r) => r.parentEmail === 'roditelj@test.hr')).toBe(true)
    expect(recipients.every((r) => r.children.length === 1)).toBe(true)
    expect(recipients.map((r) => r.assessmentIds)).toEqual([['card-1'], ['card-2']])
    // This is the contrast that matters: the other kinds deliberately DO merge.
    const merged = buildEmailRecipients([
      { id: 'student-1', firstName: 'Iva', lastName: 'Horvat', parentEmail: 'roditelj@test.hr' },
      { id: 'student-2', firstName: 'Luka', lastName: 'Horvat', parentEmail: 'roditelj@test.hr' },
    ])
    expect(merged.recipients).toHaveLength(1)
    expect(merged.recipients[0].children).toHaveLength(2)
  })

  it('every row carries exactly one card', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate(),
      candidate({ assessmentId: 'card-2', studentId: 'student-2', parentEmail: 'drugi@test.hr' }),
      candidate({ assessmentId: 'card-3', studentId: 'student-3', parentEmail: 'treci@test.hr' }),
    ])
    expect(recipients.every((r) => r.assessmentIds.length === 1)).toBe(true)
    expect(recipients.every((r) => r.children.length === 1)).toBe(true)
  })

  it('keys the row on the card, not the inbox, so siblings are independent', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate(),
      candidate({ assessmentId: 'card-2', studentId: 'student-2' }),
    ])
    expect(recipients.map((r) => r.rowKey)).toEqual(['card-1', 'card-2'])
    expect(new Set(recipients.map((r) => r.rowKey)).size).toBe(2)
  })

  it('gives a child with cards in two groups one row per group', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate({ assessmentId: 'card-slr', groupLabel: 'SLR 2 – utorkom' }),
      candidate({ assessmentId: 'card-comp', groupLabel: 'WRO – srijedom' }),
    ])
    expect(recipients).toHaveLength(2)
    expect(recipients.map((r) => r.children[0].groupLabel).sort()).toEqual([
      'SLR 2 – utorkom',
      'WRO – srijedom',
    ])
  })

  it('splits off children whose parent address is missing or unusable', () => {
    const { recipients, skipped } = buildEvaluationRecipients([
      candidate(),
      candidate({ assessmentId: 'card-2', studentId: 'student-2', parentEmail: null }),
      candidate({
        assessmentId: 'card-3',
        studentId: 'student-3',
        firstName: 'Filip',
        parentEmail: 'nije-email',
      }),
    ])
    expect(recipients).toHaveLength(1)
    expect(skipped.map((s) => s.reason).sort()).toEqual(['INVALID_EMAIL', 'MISSING_EMAIL'])
    expect(skipped.find((s) => s.reason === 'INVALID_EMAIL')?.studentName).toBe('Filip Horvat')
  })

  it('normalizes the address so an Outlook paste still reaches the same inbox', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate({ parentEmail: 'Ime Prezime <Roditelj@Test.HR>' }),
    ])
    expect(recipients[0].parentEmail).toBe('roditelj@test.hr')
  })

  it('ignores a duplicate card row', () => {
    const { recipients } = buildEvaluationRecipients([candidate(), candidate()])
    expect(recipients).toHaveLength(1)
  })

  it('carries the completeness flag through for the composer badge', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate({ complete: false }),
      candidate({ assessmentId: 'card-2', studentId: 'student-2', complete: true }),
    ])
    const byKey = new Map(recipients.map((r) => [r.rowKey, r.children[0].complete]))
    expect(byKey.get('card-1')).toBe(false)
    expect(byKey.get('card-2')).toBe(true)
  })

  it('sorts by child then group, so the list reads as a roster', () => {
    const { recipients } = buildEvaluationRecipients([
      candidate({ assessmentId: 'c', firstName: 'Zoran', studentId: 's3' }),
      candidate({ assessmentId: 'a', firstName: 'Ana', studentId: 's1' }),
      candidate({ assessmentId: 'b', firstName: 'Marko', studentId: 's2' }),
    ])
    expect(recipients.map((r) => r.children[0].name)).toEqual([
      'Ana Horvat',
      'Marko Horvat',
      'Zoran Horvat',
    ])
  })
})

describe('skip reasons', () => {
  it('every reason has admin-facing text in both lengths', () => {
    for (const reason of ['MISSING_EMAIL', 'INVALID_EMAIL', 'NOT_GRADED'] as const) {
      expect(SKIP_REASON_TEXT[reason]).toBeTruthy()
      expect(SKIP_REASON_SHORT[reason]).toBeTruthy()
    }
  })
})
