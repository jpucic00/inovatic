import { describe, expect, it } from 'vitest'
import { groupSiblingsByYear } from '@/lib/family-discount'

const YEAR = '2026/2027'
const OTHER_YEAR = '2025/2026'

type Candidate = Parameters<typeof groupSiblingsByYear>[2][number]

function child(
  id: string,
  parentEmail: string | null = 'roditelj@x.hr',
  enrollments: { schoolYear: string; programTitle: string }[] = [
    { schoolYear: YEAR, programTitle: 'Svijet LEGO robotike 2' },
  ],
): Candidate {
  return { id, firstName: 'Ana', lastName: `Prezime-${id}`, parentEmail, enrollments }
}

describe('groupSiblingsByYear', () => {
  it('flags the year when another child shares the parent e-mail', () => {
    const result = groupSiblingsByYear('roditelj@x.hr', [YEAR], [child('sib')], 'self')

    expect(Object.keys(result)).toEqual([YEAR])
    expect(result[YEAR]).toHaveLength(1)
    expect(result[YEAR][0].id).toBe('sib')
  })

  it('names the sibling and the program that makes the year qualify', () => {
    // The note has to survive an admin asking "why did this fire?" — a sibling in
    // the competitive program counts, which is not guessable from a bare badge.
    const result = groupSiblingsByYear(
      'roditelj@x.hr',
      [YEAR],
      [child('sib', 'roditelj@x.hr', [{ schoolYear: YEAR, programTitle: 'Natjecateljski program' }])],
      'self',
    )

    expect(result[YEAR][0].programTitles).toEqual(['Natjecateljski program'])
  })

  it('never counts the child themselves, however many programs they are in', () => {
    // The rule is a second CHILD, not a second sign-up: one kid in both SLR and
    // the natjecateljski program pays full price for both.
    const self = child('self', 'roditelj@x.hr', [
      { schoolYear: YEAR, programTitle: 'Svijet LEGO robotike 2' },
      { schoolYear: YEAR, programTitle: 'Natjecateljski program' },
    ])
    const result = groupSiblingsByYear('roditelj@x.hr', [YEAR], [self], 'self')

    expect(result).toEqual({})
  })

  it('ignores a sibling enrolled only in some other year', () => {
    const result = groupSiblingsByYear(
      'roditelj@x.hr',
      [YEAR],
      [child('sib', 'roditelj@x.hr', [{ schoolYear: OTHER_YEAR, programTitle: 'SLR 1' }])],
      'self',
    )

    expect(result).toEqual({})
  })

  it('matches case-insensitively and through whitespace', () => {
    const result = groupSiblingsByYear(
      '  Roditelj@X.hr ',
      [YEAR],
      [child('sib', 'RODITELJ@x.HR')],
      'self',
    )

    expect(result[YEAR]).toHaveLength(1)
  })

  it('matches an imported "Ime Prezime <a@b>" address against the bare one', () => {
    // Older history-workbook imports left Outlook paste residue in parentEmail;
    // a family split across an imported and a form-created account is exactly the
    // case this note exists for.
    const result = groupSiblingsByYear(
      'roditelj@x.hr',
      [YEAR],
      [child('sib', 'Ivana Ivić <roditelj@x.hr>')],
      'self',
    )

    expect(result[YEAR]).toHaveLength(1)
  })

  it('rejects a substring address the SQL prefilter would have let through', () => {
    // `findFamilyDiscounts` can only narrow with `contains` (the residue above
    // rules out `equals`), and `contains 'na@x.hr'` happily matches 'ana@x.hr'.
    // The exact re-match here is what stops two unrelated families merging.
    const result = groupSiblingsByYear('na@x.hr', [YEAR], [child('sib', 'ana@x.hr')], 'self')

    expect(result).toEqual({})
  })

  it('matches nobody when either side has no usable parent e-mail', () => {
    expect(groupSiblingsByYear(null, [YEAR], [child('sib')], 'self')).toEqual({})
    expect(groupSiblingsByYear('roditelj@x.hr', [YEAR], [child('sib', null)], 'self')).toEqual({})
    expect(
      groupSiblingsByYear('roditelj@x.hr', [YEAR], [child('sib', 'nije-email')], 'self'),
    ).toEqual({})
    expect(groupSiblingsByYear('nije-email', [YEAR], [child('sib')], 'self')).toEqual({})
  })

  it('returns nothing when the child has no qualifying year', () => {
    expect(groupSiblingsByYear('roditelj@x.hr', [], [child('sib')], 'self')).toEqual({})
  })

  it('lists several siblings under one year, ordered by name', () => {
    const result = groupSiblingsByYear(
      'roditelj@x.hr',
      [YEAR],
      [
        { ...child('b', 'roditelj@x.hr'), firstName: 'Ivo', lastName: 'Zorić' },
        { ...child('a', 'roditelj@x.hr'), firstName: 'Ana', lastName: 'Anić' },
      ],
      'self',
    )

    expect(result[YEAR].map((s) => s.lastName)).toEqual(['Anić', 'Zorić'])
  })

  it('keys each year separately for a family spanning two of them', () => {
    const result = groupSiblingsByYear(
      'roditelj@x.hr',
      [YEAR, OTHER_YEAR],
      [
        child('sib', 'roditelj@x.hr', [
          { schoolYear: YEAR, programTitle: 'SLR 2' },
          { schoolYear: OTHER_YEAR, programTitle: 'SLR 1' },
        ]),
      ],
      'self',
    )

    expect(result[YEAR][0].programTitles).toEqual(['SLR 2'])
    expect(result[OTHER_YEAR][0].programTitles).toEqual(['SLR 1'])
  })
})
