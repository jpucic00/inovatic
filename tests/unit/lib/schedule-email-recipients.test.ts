import { describe, expect, it } from 'vitest'
import {
  assertScheduleBelongsTo,
  buildScheduleRecipients,
  type ScheduleCandidate,
} from '@/lib/schedule-email-recipients'

const candidate = (over: Partial<ScheduleCandidate> = {}): ScheduleCandidate => ({
  studentId: 's1',
  firstName: 'Ana',
  lastName: 'Anić',
  parentEmail: 'obitelj@example.hr',
  groupLabel: 'SLR 2 – utorkom · Svijet LEGO robotike 2',
  ...over,
})

describe('buildScheduleRecipients', () => {
  it('merges two siblings on one address into ONE row naming both', () => {
    // The deliberate opposite of the evaluation and credentials builders: a
    // termin is not a secret, and the parent asked for one mail per family.
    const { recipients, skipped } = buildScheduleRecipients([
      candidate({ studentId: 's1', firstName: 'Ana' }),
      candidate({ studentId: 's2', firstName: 'Marko', groupLabel: 'Uvod – četvrtkom' }),
    ])
    expect(skipped).toEqual([])
    expect(recipients).toHaveLength(1)
    expect(recipients[0]).toMatchObject({
      parentEmail: 'obitelj@example.hr',
      rowKey: 'obitelj@example.hr',
      studentIds: ['s1', 's2'],
      assessmentIds: [],
    })
    expect(recipients[0].children.map((c) => c.name)).toEqual(['Ana Anić', 'Marko Anić'])
    expect(recipients[0].children[1].groupLabel).toBe('Uvod – četvrtkom')
  })

  it('folds the same child appearing twice (two selected groups) into one entry', () => {
    const { recipients } = buildScheduleRecipients([candidate(), candidate()])
    expect(recipients[0].studentIds).toEqual(['s1'])
    expect(recipients[0].children).toHaveLength(1)
  })

  it('normalizes the address so a case or Outlook-residue difference still merges', () => {
    const { recipients } = buildScheduleRecipients([
      candidate({ studentId: 's1', parentEmail: 'Obitelj@Example.hr' }),
      candidate({ studentId: 's2', parentEmail: 'Ana Anić <obitelj@example.hr>' }),
    ])
    expect(recipients).toHaveLength(1)
    expect(recipients[0].studentIds).toEqual(['s1', 's2'])
  })

  it('reports a child without a usable address by name instead of dropping them', () => {
    const { recipients, skipped } = buildScheduleRecipients([
      candidate({ studentId: 's1', parentEmail: null }),
      candidate({ studentId: 's2', firstName: 'Marko', parentEmail: 'nije adresa' }),
    ])
    expect(recipients).toEqual([])
    expect(skipped).toEqual([
      { studentId: 's1', studentName: 'Ana Anić', reason: 'MISSING_EMAIL' },
      { studentId: 's2', studentName: 'Marko Anić', reason: 'INVALID_EMAIL' },
    ])
  })
})

describe('assertScheduleBelongsTo', () => {
  const expected = {
    parentEmail: 'obitelj@example.hr',
    city: 'SPLIT' as const,
    studentIds: ['s1', 's2'],
  }
  const row = (id: string, over = {}) => ({
    id,
    parentEmail: 'obitelj@example.hr',
    city: 'SPLIT' as const,
    deletedAt: null,
    ...over,
  })

  it('passes when every named child still belongs to the address', () => {
    expect(assertScheduleBelongsTo(expected, [row('s1'), row('s2')])).toEqual({ ok: true })
  })

  it('accepts a normalized match on the stored address', () => {
    expect(
      assertScheduleBelongsTo(expected, [
        row('s1', { parentEmail: 'Obitelj@Example.hr' }),
        row('s2', { parentEmail: 'Roditelj <obitelj@example.hr>' }),
      ]),
    ).toEqual({ ok: true })
  })

  it('refuses a row that names no child', () => {
    expect(assertScheduleBelongsTo({ ...expected, studentIds: [] }, [])).toMatchObject({
      ok: false,
    })
  })

  it('refuses when the loaded set is not exactly the named set', () => {
    // One child gone, or one extra — either way the row no longer describes
    // what is about to be mailed.
    expect(assertScheduleBelongsTo(expected, [row('s1')])).toMatchObject({ ok: false })
    expect(
      assertScheduleBelongsTo(expected, [row('s1'), row('s2'), row('s3')]),
    ).toMatchObject({ ok: false })
    expect(assertScheduleBelongsTo(expected, [row('s1'), row('s9')])).toMatchObject({
      ok: false,
    })
  })

  it('refuses when ANY named child is deleted', () => {
    expect(
      assertScheduleBelongsTo(expected, [row('s1'), row('s2', { deletedAt: new Date() })]),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('izbrisan') })
  })

  it('refuses when ANY named child now has a different parent address', () => {
    // The cohort was resolved before the address was corrected — mailing the
    // old address would hand this child's groups to whoever reads it now.
    expect(
      assertScheduleBelongsTo(expected, [
        row('s1'),
        row('s2', { parentEmail: 'drugi@example.hr' }),
      ]),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('promijenila') })
  })

  it('refuses a child from the other city', () => {
    expect(
      assertScheduleBelongsTo(expected, [row('s1'), row('s2', { city: 'SIBENIK' })]),
    ).toMatchObject({ ok: false, reason: expect.stringContaining('drugom gradu') })
  })
})
