import { describe, expect, it } from 'vitest'
import { computeTrialSession, fromDateKey, toDateKey } from '@/lib/session-dates'

// Mon 2026-09-07 … Sat 2026-09-12 — one calendar week.
const WEEK = { startDate: fromDateKey('2026-09-07'), endDate: fromDateKey('2026-09-12') }

describe('computeTrialSession', () => {
  it('returns the single occurrence of the group weekday inside the week', () => {
    const date = computeTrialSession({ dayOfWeek: 'Utorak', ...WEEK })
    expect(date && toDateKey(date)).toBe('2026-09-08')
  })

  it('resolves every weekday of the week to its own date', () => {
    const byDay = Object.fromEntries(
      (['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'] as const).map((d) => {
        const date = computeTrialSession({ dayOfWeek: d, ...WEEK })
        return [d, date && toDateKey(date)]
      }),
    )
    expect(byDay).toEqual({
      Ponedjeljak: '2026-09-07',
      Utorak: '2026-09-08',
      Srijeda: '2026-09-09',
      Četvrtak: '2026-09-10',
      Petak: '2026-09-11',
      Subota: '2026-09-12',
    })
  })

  /**
   * A holiday removes that group's trial rather than moving it — the same rule
   * the rest of the app applies to a lost week, and the reason the return type
   * is nullable rather than "the next best date".
   */
  it('drops the trial when a holiday lands on the group weekday', () => {
    expect(
      computeTrialSession({
        dayOfWeek: 'Utorak',
        ...WEEK,
        holidayDates: new Set(['2026-09-08']),
      }),
    ).toBeNull()
  })

  it('is unaffected by a holiday on a different day', () => {
    const date = computeTrialSession({
      dayOfWeek: 'Utorak',
      ...WEEK,
      holidayDates: new Set(['2026-09-09']),
    })
    expect(date && toDateKey(date)).toBe('2026-09-08')
  })

  it('returns null for a group with no weekday (radionica)', () => {
    expect(computeTrialSession({ dayOfWeek: null, ...WEEK })).toBeNull()
  })

  it('returns null when the year has no trial week', () => {
    expect(
      computeTrialSession({ dayOfWeek: 'Utorak', startDate: null, endDate: null }),
    ).toBeNull()
  })

  it('never returns a date outside the week', () => {
    // Nedjelja is not in [Mon…Sat], so the group has no trial that week.
    expect(computeTrialSession({ dayOfWeek: 'Nedjelja', ...WEEK })).toBeNull()
  })
})
