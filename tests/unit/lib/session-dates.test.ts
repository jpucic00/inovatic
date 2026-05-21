import { describe, expect, it } from 'vitest'
import {
  computeExpectedSessions,
  fromDateKey,
  toDateKey,
  todayUtc,
} from '@/lib/session-dates'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('toDateKey', () => {
  it('produces YYYY-MM-DD UTC slice', () => {
    expect(toDateKey(utc(2026, 5, 15))).toBe('2026-05-15')
    expect(toDateKey(utc(2026, 1, 1))).toBe('2026-01-01')
    expect(toDateKey(utc(2026, 12, 31))).toBe('2026-12-31')
  })

  it('strips the time portion', () => {
    const dt = new Date(Date.UTC(2026, 4, 15, 14, 30, 45))
    expect(toDateKey(dt)).toBe('2026-05-15')
  })

  it('preserves date when crossing DST boundary in local TZ (UTC anchored)', () => {
    expect(toDateKey(utc(2026, 3, 30))).toBe('2026-03-30')
    expect(toDateKey(utc(2026, 10, 26))).toBe('2026-10-26')
  })
})

describe('fromDateKey', () => {
  it('round-trips with toDateKey', () => {
    const original = utc(2026, 5, 15)
    expect(fromDateKey(toDateKey(original)).getTime()).toBe(original.getTime())
  })

  it('parses to UTC-midnight', () => {
    const d = fromDateKey('2026-05-15')
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(4)
    expect(d.getUTCDate()).toBe(15)
    expect(d.getUTCHours()).toBe(0)
  })

  it('throws on malformed input', () => {
    expect(() => fromDateKey('15.05.2026')).toThrow()
    expect(() => fromDateKey('')).toThrow()
    expect(() => fromDateKey('2026-5-15')).toThrow()
  })
})

describe('computeExpectedSessions — weekday parsing', () => {
  const oneMonth = [{ startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) }]

  it('returns [] for null weekday', () => {
    expect(computeExpectedSessions({ dayOfWeek: null, moduleWindows: oneMonth })).toEqual([])
  })

  it('returns [] for empty-string weekday', () => {
    expect(computeExpectedSessions({ dayOfWeek: '', moduleWindows: oneMonth })).toEqual([])
  })

  it('returns [] for unrecognised weekday name', () => {
    expect(
      computeExpectedSessions({ dayOfWeek: 'Wodensday', moduleWindows: oneMonth }),
    ).toEqual([])
  })

  it('parses Croatian "Četvrtak" (with diacritics)', () => {
    const out = computeExpectedSessions({ dayOfWeek: 'Četvrtak', moduleWindows: oneMonth })
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((d) => d.getUTCDay() === 4)).toBe(true)
  })

  it('parses ASCII "Cetvrtak" (no diacritics)', () => {
    const out = computeExpectedSessions({ dayOfWeek: 'Cetvrtak', moduleWindows: oneMonth })
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((d) => d.getUTCDay() === 4)).toBe(true)
  })

  it.each([
    ['Nedjelja', 0],
    ['Ponedjeljak', 1],
    ['Utorak', 2],
    ['Srijeda', 3],
    ['Četvrtak', 4],
    ['Petak', 5],
    ['Subota', 6],
  ])('parses %s as JS day index %d', (name, idx) => {
    const out = computeExpectedSessions({ dayOfWeek: name, moduleWindows: oneMonth })
    expect(out.every((d) => d.getUTCDay() === idx)).toBe(true)
  })
})

describe('computeExpectedSessions — window math', () => {
  it('single window — emits weekly Thursdays', () => {
    // Sept 2026: Thursdays are 3, 10, 17, 24
    const out = computeExpectedSessions({
      dayOfWeek: 'Četvrtak',
      moduleWindows: [{ startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) }],
    })
    expect(out.map(toDateKey)).toEqual([
      '2026-09-03',
      '2026-09-10',
      '2026-09-17',
      '2026-09-24',
    ])
  })

  it('returns [] when both startDate and endDate are null on every window', () => {
    expect(
      computeExpectedSessions({
        dayOfWeek: 'Cetvrtak',
        moduleWindows: [{ startDate: null, endDate: null }],
      }),
    ).toEqual([])
  })

  it('returns [] for empty moduleWindows', () => {
    expect(
      computeExpectedSessions({ dayOfWeek: 'Cetvrtak', moduleWindows: [] }),
    ).toEqual([])
  })

  it('weekday equals start date — included', () => {
    // Sept 3 2026 is a Thursday; window starts that day
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [{ startDate: utc(2026, 9, 3), endDate: utc(2026, 9, 10) }],
    })
    expect(out.map(toDateKey)).toEqual(['2026-09-03', '2026-09-10'])
  })

  it('weekday equals end date — included', () => {
    // Sept 3 2026 is Thursday, ending Sept 10 (also Thursday)
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [{ startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 10) }],
    })
    expect(out.map(toDateKey)).toContain('2026-09-10')
  })

  it('multiple disjoint windows — emits union of dates ascending', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [
        { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) },
        { startDate: utc(2026, 11, 1), endDate: utc(2026, 11, 30) },
      ],
    })
    expect(out.map(toDateKey)).toEqual([
      '2026-09-03',
      '2026-09-10',
      '2026-09-17',
      '2026-09-24',
      '2026-11-05',
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
    ])
  })

  it('overlapping windows — produce no duplicate dates', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [
        { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) },
        { startDate: utc(2026, 9, 15), endDate: utc(2026, 10, 15) },
      ],
    })
    const keys = out.map(toDateKey)
    expect(keys).toEqual([...new Set(keys)])
    expect(keys).toContain('2026-09-17')
    expect(keys).toContain('2026-09-24')
    expect(keys).toContain('2026-10-01')
  })

  it('cross-year window spanning Dec 31', () => {
    // Dec 2026: Thursdays 3, 10, 17, 24, 31; Jan 2027: 7, 14
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [{ startDate: utc(2026, 12, 28), endDate: utc(2027, 1, 14) }],
    })
    expect(out.map(toDateKey)).toEqual(['2026-12-31', '2027-01-07', '2027-01-14'])
  })

  it('Feb 29 in a leap year (2028) — handled correctly when on weekday', () => {
    // Feb 29 2028 is a Tuesday
    const out = computeExpectedSessions({
      dayOfWeek: 'Utorak',
      moduleWindows: [{ startDate: utc(2028, 2, 1), endDate: utc(2028, 2, 29) }],
    })
    expect(out.map(toDateKey)).toEqual([
      '2028-02-01',
      '2028-02-08',
      '2028-02-15',
      '2028-02-22',
      '2028-02-29',
    ])
  })

  it('window where weekday never occurs — empty result', () => {
    // Sept 3 - 8 2026 — Thursday only on the 3rd; ask for Monday
    const out = computeExpectedSessions({
      dayOfWeek: 'Ponedjeljak',
      moduleWindows: [{ startDate: utc(2026, 9, 4), endDate: utc(2026, 9, 6) }],
    })
    expect(out).toEqual([])
  })

  it('returns ascending order even when windows supplied in reverse', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [
        { startDate: utc(2026, 11, 1), endDate: utc(2026, 11, 30) },
        { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) },
      ],
    })
    const times = out.map((d) => d.getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('skips windows that are missing startDate or endDate', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Cetvrtak',
      moduleWindows: [
        { startDate: null, endDate: utc(2026, 9, 30) },
        { startDate: utc(2026, 9, 1), endDate: null },
        { startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) },
      ],
    })
    expect(out.length).toBe(4)
  })
})

describe('todayUtc', () => {
  it('returns a UTC-midnight Date', () => {
    const t = todayUtc()
    expect(t.getUTCHours()).toBe(0)
    expect(t.getUTCMinutes()).toBe(0)
    expect(t.getUTCSeconds()).toBe(0)
  })

  it('returns today (within reason)', () => {
    const t = todayUtc()
    const now = new Date()
    expect(Math.abs(t.getTime() - now.getTime())).toBeLessThan(24 * 60 * 60 * 1000)
  })
})
