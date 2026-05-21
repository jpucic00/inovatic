import { describe, expect, it } from 'vitest'
import { getCurrentActiveModule } from '@/lib/active-module'

const SCHOOL_YEAR = '2026/2027'
const NOW = new Date('2026-10-15T12:00:00Z')

type Mod = Parameters<typeof getCurrentActiveModule>[0][number]

const mkModule = (
  id: string,
  sortOrder: number,
  schedule: { startDate: Date | null; endDate: Date | null } | null,
): Mod => ({
  id,
  title: id,
  sortOrder,
  schedules: schedule
    ? [{ schoolYear: SCHOOL_YEAR, startDate: schedule.startDate, endDate: schedule.endDate }]
    : [],
})

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('getCurrentActiveModule — priority rules', () => {
  it('rule 1: picks the currently-Aktivan window first (covers today)', () => {
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) }), // Završen
      mkModule('M2', 1, { startDate: utc(2026, 10, 1), endDate: utc(2026, 10, 31) }), // Aktivan
      mkModule('M3', 2, { startDate: utc(2026, 11, 1), endDate: utc(2026, 11, 30) }), // Nadolazi
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M2')
  })

  it('rule 2: falls back to the soonest-upcoming Nadolazi when no Aktivan', () => {
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 8, 1), endDate: utc(2026, 8, 31) }), // Završen
      mkModule('M2', 1, { startDate: utc(2026, 11, 1), endDate: utc(2026, 11, 30) }), // Nadolazi (later)
      mkModule('M3', 2, { startDate: utc(2026, 10, 20), endDate: utc(2026, 10, 31) }), // Nadolazi (soonest)
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M3')
  })

  it('rule 3: falls back to most-recently-Završen when no Aktivan + no Nadolazi', () => {
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 8, 1), endDate: utc(2026, 8, 31) }),
      mkModule('M2', 1, { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) }), // most recent end
      mkModule('M3', 2, { startDate: utc(2026, 7, 1), endDate: utc(2026, 7, 31) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M2')
  })

  it('rule 4: falls back to first-by-sortOrder when no schedules exist for the year', () => {
    const modules = [
      mkModule('M3', 2, null),
      mkModule('M1', 0, null),
      mkModule('M2', 1, null),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M1')
  })
})

describe('getCurrentActiveModule — edge cases', () => {
  it('returns null for empty module list', () => {
    expect(getCurrentActiveModule([], SCHOOL_YEAR, NOW)).toBeNull()
  })

  it('all Nadolazi → first upcoming wins', () => {
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 11, 15), endDate: utc(2026, 11, 30) }),
      mkModule('M2', 1, { startDate: utc(2026, 11, 1), endDate: utc(2026, 11, 14) }),
      mkModule('M3', 2, { startDate: utc(2026, 12, 1), endDate: utc(2026, 12, 31) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M2')
  })

  it('all Završen → most recent wins', () => {
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 1, 1), endDate: utc(2026, 1, 31) }),
      mkModule('M2', 1, { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) }),
      mkModule('M3', 2, { startDate: utc(2026, 5, 1), endDate: utc(2026, 5, 31) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M2')
  })

  it('Aktivan = today exactly equals startDate (boundary inclusivity, lower)', () => {
    const today = utc(2026, 10, 15)
    const modules = [
      mkModule('M1', 0, { startDate: today, endDate: utc(2026, 10, 31) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, today)?.id).toBe('M1')
  })

  it('Aktivan = today exactly equals endDate (boundary inclusivity, upper)', () => {
    const today = utc(2026, 10, 31)
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 10, 1), endDate: today }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, today)?.id).toBe('M1')
  })

  it('cross-year selection: today in January 2027 prefers Aktivan winter module', () => {
    const today = utc(2027, 1, 10)
    const modules = [
      mkModule('M1', 0, { startDate: utc(2026, 10, 1), endDate: utc(2026, 12, 15) }), // Završen
      mkModule('M2', 1, { startDate: utc(2026, 12, 16), endDate: utc(2027, 1, 31) }), // Aktivan
      mkModule('M3', 2, { startDate: utc(2027, 2, 1), endDate: utc(2027, 3, 15) }), // Nadolazi
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, today)?.id).toBe('M2')
  })

  it('ignores schedules for a different schoolYear', () => {
    const modules: Mod[] = [
      {
        id: 'M1',
        title: 'M1',
        sortOrder: 0,
        schedules: [
          { schoolYear: '2025/2026', startDate: utc(2026, 10, 1), endDate: utc(2026, 10, 31) },
        ],
      },
    ]
    // For 2026/2027 there's no schedule → falls through to rule 4 (first by sortOrder)
    expect(getCurrentActiveModule(modules, '2026/2027', NOW)?.id).toBe('M1')
  })

  it('mixes schedule-less and scheduled modules — Aktivan still wins', () => {
    const modules = [
      mkModule('M1', 0, null),
      mkModule('M2', 1, { startDate: utc(2026, 10, 1), endDate: utc(2026, 10, 31) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M2')
  })

  it('defaults `now` to current time when not supplied', () => {
    const modules = [
      mkModule('M1', 0, { startDate: utc(1900, 1, 1), endDate: utc(2200, 12, 31) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR)?.id).toBe('M1')
  })

  it('module with null start/end falls through to fallback rules', () => {
    const modules = [
      mkModule('M1', 0, { startDate: null, endDate: null }),
      mkModule('M2', 1, { startDate: utc(2026, 11, 1), endDate: utc(2026, 11, 30) }),
    ]
    expect(getCurrentActiveModule(modules, SCHOOL_YEAR, NOW)?.id).toBe('M2')
  })
})
