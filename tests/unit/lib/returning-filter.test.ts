import { describe, expect, it } from 'vitest'
import {
  isReturningStudent,
  parseReturningFilter,
  RETURNING_FILTER_LABELS,
  returningStudentWhere,
} from '@/lib/returning-filter'
import { RETURNING_INQUIRY_LABEL } from '@/lib/inquiry-status'

const YEAR = '2025/2026'
const y = (...years: string[]) => years.map((schoolYear) => ({ schoolYear }))

describe('isReturningStudent', () => {
  it('marks a student enrolled this year who was also enrolled earlier', () => {
    expect(isReturningStudent(y('2024/2025', YEAR), YEAR)).toBe(true)
  })

  it('does not mark a first-time student', () => {
    expect(isReturningStudent(y(YEAR), YEAR)).toBe(false)
  })

  it('does not mark a student who has left — prior years alone are not enough', () => {
    expect(isReturningStudent(y('2023/2024', '2024/2025'), YEAR)).toBe(false)
  })

  it('counts any earlier year, not only the one immediately before', () => {
    // A child who did SLR 1, sat a year out, and came back is exactly the
    // returning polaznik this marks.
    expect(isReturningStudent(y('2022/2023', YEAR), YEAR)).toBe(true)
  })

  it('ignores later years, so next year cannot make this year returning', () => {
    // An admin planning ahead can enrol a child into the coming year while the
    // list still shows the current one.
    expect(isReturningStudent(y(YEAR, '2026/2027'), YEAR)).toBe(false)
    expect(isReturningStudent(y('2024/2025', YEAR, '2026/2027'), YEAR)).toBe(true)
  })

  it('does not count two enrollments within the same year as returning', () => {
    // Two groups in one school year is one year of attendance.
    expect(isReturningStudent(y(YEAR, YEAR), YEAR)).toBe(false)
  })

  it('is false for a student with no enrollments at all', () => {
    expect(isReturningStudent([], YEAR)).toBe(false)
  })
})

describe('returningStudentWhere — SQL twin of isReturningStudent', () => {
  it('requires the reference year in both directions', () => {
    for (const filter of ['RETURNING', 'NEW'] as const) {
      const where = returningStudentWhere(filter, YEAR)
      expect(where.AND).toContainEqual({
        enrollments: { some: { schoolYear: YEAR } },
      })
    }
  })

  it('asks for an earlier year on RETURNING and forbids one on NEW', () => {
    expect(returningStudentWhere('RETURNING', YEAR).AND).toContainEqual({
      enrollments: { some: { schoolYear: { lt: YEAR } } },
    })
    expect(returningStudentWhere('NEW', YEAR).AND).toContainEqual({
      enrollments: { none: { schoolYear: { lt: YEAR } } },
    })
  })

  it('orders YYYY/YYYY labels the same way the in-memory rule does', () => {
    // The SQL side compares school years as strings; this is what makes that
    // safe, and what would break first if the label format ever changed.
    expect('2024/2025' < YEAR).toBe(true)
    expect('2026/2027' < YEAR).toBe(false)
  })
})

describe('parseReturningFilter', () => {
  it('accepts the two filter values', () => {
    expect(parseReturningFilter('RETURNING')).toBe('RETURNING')
    expect(parseReturningFilter('NEW')).toBe('NEW')
  })

  it('drops anything else, so a hand-edited URL cannot narrow the list oddly', () => {
    expect(parseReturningFilter(undefined)).toBeUndefined()
    expect(parseReturningFilter('')).toBeUndefined()
    expect(parseReturningFilter('returning')).toBeUndefined()
    expect(parseReturningFilter('ALL')).toBeUndefined()
  })
})

describe('RETURNING_FILTER_LABELS', () => {
  it('reuses the badge label so the filter and the table cell cannot diverge', () => {
    expect(RETURNING_FILTER_LABELS.RETURNING).toBe(RETURNING_INQUIRY_LABEL)
  })
})
