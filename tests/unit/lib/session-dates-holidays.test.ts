import { describe, expect, it } from 'vitest'
import { computeExpectedSessions, toDateKey } from '@/lib/session-dates'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('computeExpectedSessions — holidayDates', () => {
  const september2026 = [{ startDate: utc(2026, 9, 1), endDate: utc(2026, 9, 30) }]

  it('drops session dates that match a holiday key', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Četvrtak',
      moduleWindows: september2026,
      holidayDates: new Set(['2026-09-10', '2026-09-24']),
    })
    expect(out.map(toDateKey)).toEqual(['2026-09-03', '2026-09-17'])
  })

  it('ignores holiday keys that do not land on a session day', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Četvrtak',
      moduleWindows: september2026,
      holidayDates: new Set(['2026-09-11', '2026-09-12']), // Fri + Sat
    })
    expect(out.map(toDateKey)).toEqual(['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'])
  })

  it('is a no-op when holidayDates is omitted', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Četvrtak',
      moduleWindows: september2026,
    })
    expect(out.length).toBe(4)
  })

  it('is a no-op when holidayDates is empty', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Četvrtak',
      moduleWindows: september2026,
      holidayDates: new Set<string>(),
    })
    expect(out.length).toBe(4)
  })

  it('drops every session if every session date is a holiday', () => {
    const out = computeExpectedSessions({
      dayOfWeek: 'Četvrtak',
      moduleWindows: september2026,
      holidayDates: new Set(['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']),
    })
    expect(out).toEqual([])
  })
})
