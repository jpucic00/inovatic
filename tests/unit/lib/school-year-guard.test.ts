import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archivedYearError } from '@/lib/school-year-guard'

// archivedYearError is pure once `isArchivedYear` is pinned — it does no DB
// work and is reused across 10+ admin/teacher actions. Pinning the exact
// Croatian error string here guards against accidental rewording that would
// silently break every caller. Tests pivot on a fixed "now" so the
// current/archived/future split is deterministic.
describe('archivedYearError', () => {
  beforeEach(() => {
    // 2026-10-15 → current school year is 2026/2027 (transition is Sept 1).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for the current school year', () => {
    expect(archivedYearError('2026/2027')).toBeNull()
  })

  it('returns null for a future school year', () => {
    expect(archivedYearError('2027/2028')).toBeNull()
  })

  it('returns the canonical Croatian failure for an archived year', () => {
    const result = archivedYearError('2024/2025')
    expect(result).toEqual({
      success: false,
      error: 'Arhivirana školska godina je samo za pregled.',
    })
  })

  it('returns the same failure for a deeply archived year', () => {
    const result = archivedYearError('2020/2021')
    expect(result?.success).toBe(false)
    expect(result?.error).toBe('Arhivirana školska godina je samo za pregled.')
  })

  it('returns a frozen failure object that callers cannot mutate', () => {
    const result = archivedYearError('2024/2025')
    expect(result).not.toBeNull()
    // ARCHIVED_ERROR is shared across all callers via Object.freeze, so a
    // caller cannot accidentally graft extra fields onto the response and
    // contaminate the next call.
    expect(Object.isFrozen(result)).toBe(true)
  })
})
