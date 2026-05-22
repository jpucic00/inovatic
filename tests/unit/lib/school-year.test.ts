import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeSchoolYear,
  getNextSchoolYear,
  isArchivedYear,
  schoolYearDateRange,
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

describe('schoolYearDateRange', () => {
  it('spans Sept 1 to the next Sept 1', () => {
    const { gte, lt } = schoolYearDateRange('2025/2026')
    expect([gte.getFullYear(), gte.getMonth(), gte.getDate()]).toEqual([2025, 8, 1])
    expect([lt.getFullYear(), lt.getMonth(), lt.getDate()]).toEqual([2026, 8, 1])
  })

  it('buckets an August date into the school year that is ending', () => {
    const { gte, lt } = schoolYearDateRange('2025/2026')
    const august = new Date(2026, 7, 15)
    expect(august >= gte && august < lt).toBe(true)
  })

  it('excludes a September date (start of the next year)', () => {
    const { lt } = schoolYearDateRange('2025/2026')
    expect(new Date(2026, 8, 1) >= lt).toBe(true)
  })
})
