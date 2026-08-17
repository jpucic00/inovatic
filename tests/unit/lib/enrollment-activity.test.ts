import { describe, expect, it } from 'vitest'
import {
  activeEnrollmentWhere,
  activeSchoolYears,
  isActiveSchoolYear,
} from '@/lib/enrollment-activity'
import { computeSchoolYear, getNextSchoolYear, getPreviousSchoolYear } from '@/lib/school-year'

// computeSchoolYear flips on 1 September.
const AUG_31 = new Date('2026-08-31T12:00:00.000Z')
const SEP_1 = new Date('2026-09-01T12:00:00.000Z')

describe('activeSchoolYears', () => {
  it('is the current year plus the next one', () => {
    expect(activeSchoolYears(AUG_31)).toEqual(['2025/2026', '2026/2027'])
  })

  it('rolls over on 1 September', () => {
    expect(activeSchoolYears(SEP_1)).toEqual(['2026/2027', '2027/2028'])
  })

  /**
   * The reason the next year counts at all: next year's accounts are created
   * over the summer and the credentials campaign runs then. Under a
   * current-year-only rule every password mailed in July would fail on first use.
   */
  it('admits a child enrolled only for next year, during the summer', () => {
    expect(isActiveSchoolYear('2026/2027', AUG_31)).toBe(true)
  })

  /**
   * The requested behaviour: a child not re-enrolled loses access at the flip.
   * A child who HAS been re-enrolled was already covered by the next-year arm
   * before it, so their access is continuous — which is why no grace tail exists.
   */
  it('drops last year at the flip, with no grace tail', () => {
    expect(isActiveSchoolYear('2025/2026', AUG_31)).toBe(true)
    expect(isActiveSchoolYear('2025/2026', SEP_1)).toBe(false)
    expect(isActiveSchoolYear('2026/2027', SEP_1)).toBe(true)
  })

  it('rejects a year two ahead', () => {
    expect(isActiveSchoolYear('2028/2029', SEP_1)).toBe(false)
  })
})

/**
 * The pure function and its Prisma mirror MUST stay in sync — the same
 * discipline isEnrollmentPending / pendingEnrollmentWhere follow. A drift means
 * the login gate and the data gates disagree about the same child.
 */
describe('activeEnrollmentWhere mirrors activeSchoolYears', () => {
  for (const now of [AUG_31, SEP_1, new Date('2026-01-15T00:00:00.000Z')]) {
    it(`agrees at ${now.toISOString().slice(0, 10)}`, () => {
      const where = activeEnrollmentWhere(now)
      expect(where.schoolYear).toEqual({ in: activeSchoolYears(now) })

      const current = computeSchoolYear(now)
      const years = (where.schoolYear as { in: string[] }).in
      // Everything the where admits, the predicate admits — and nothing else.
      for (const y of years) expect(isActiveSchoolYear(y, now)).toBe(true)
      expect(years).toContain(current)
      expect(years).toContain(getNextSchoolYear(current))
      expect(years).not.toContain(getPreviousSchoolYear(current))
    })
  }
})
