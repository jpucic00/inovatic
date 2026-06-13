import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeSchoolYear,
  getNextSchoolYear,
  isArchivedYear,
  schoolYearNeedsPlanning,
} from '@/lib/school-year'

describe('computeSchoolYear', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Aug 31 → previous year string (2025/2026 boundary, lower)', () => {
    vi.setSystemTime(new Date('2026-08-31T12:00:00Z'))
    expect(computeSchoolYear()).toBe('2025/2026')
  })

  it('Sept 1 → new year string (2026/2027 boundary, upper)', () => {
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    expect(computeSchoolYear()).toBe('2026/2027')
  })

  it('mid-school-year (December) returns the same year string', () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'))
    expect(computeSchoolYear()).toBe('2026/2027')
  })

  it('January (post-holiday) returns prev-Sept..current year', () => {
    vi.setSystemTime(new Date('2027-01-10T12:00:00Z'))
    expect(computeSchoolYear()).toBe('2026/2027')
  })

  it('handles end of school year (July)', () => {
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
    expect(computeSchoolYear()).toBe('2025/2026')
  })
})

describe('getNextSchoolYear', () => {
  it('advances to next sequential year pair', () => {
    expect(getNextSchoolYear('2026/2027')).toBe('2027/2028')
    expect(getNextSchoolYear('2025/2026')).toBe('2026/2027')
  })

  it('handles century boundary', () => {
    expect(getNextSchoolYear('2099/2100')).toBe('2100/2101')
  })
})

describe('isArchivedYear', () => {
  // On 2026-05-15 the current school year is 2025/2026.
  const now = new Date('2026-05-15T12:00:00Z')

  it('treats a past year as archived', () => {
    expect(isArchivedYear('2024/2025', now)).toBe(true)
    expect(isArchivedYear('2023/2024', now)).toBe(true)
  })

  it('treats the current year as editable', () => {
    expect(isArchivedYear('2025/2026', now)).toBe(false)
  })

  it('treats a future year as editable', () => {
    expect(isArchivedYear('2026/2027', now)).toBe(false)
  })
})

describe('schoolYearNeedsPlanning', () => {
  it('never flags an archived year, even when blank', () => {
    expect(
      schoolYearNeedsPlanning({ archived: true, datedModuleCount: 0, holidayCount: 0 }),
    ).toBe(false)
  })

  it('flags a non-archived year with no module dates and no holidays', () => {
    expect(
      schoolYearNeedsPlanning({ archived: false, datedModuleCount: 0, holidayCount: 0 }),
    ).toBe(true)
  })

  it('flags when module dates exist but holidays are missing', () => {
    expect(
      schoolYearNeedsPlanning({ archived: false, datedModuleCount: 16, holidayCount: 0 }),
    ).toBe(true)
  })

  it('flags when holidays exist but module dates are missing', () => {
    expect(
      schoolYearNeedsPlanning({ archived: false, datedModuleCount: 0, holidayCount: 12 }),
    ).toBe(true)
  })

  it('does not flag when both module dates and holidays are present', () => {
    expect(
      schoolYearNeedsPlanning({ archived: false, datedModuleCount: 16, holidayCount: 12 }),
    ).toBe(false)
  })
})
