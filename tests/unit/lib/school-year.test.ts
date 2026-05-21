import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'

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
