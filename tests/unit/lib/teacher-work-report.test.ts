import { describe, expect, it } from 'vitest'
import {
  REPORT_MONTH_COUNT,
  buildTeacherWorkReport,
  parseClockMinutes,
  recentMonthWindows,
  sessionMinutes,
  type TeacherWorkReport,
  type WorkReportAttendanceRow,
  type WorkReportGroup,
} from '@/lib/teacher-work-report'

const WINDOWS = recentMonthWindows(new Date('2026-07-15T10:00:00.000Z'))

/** `YYYY-MM` of the oldest reported month, and a date just before it. */
const OLDEST_KEY = WINDOWS[WINDOWS.length - 1].startKey.slice(0, 7)
const BEFORE_WINDOW = (() => {
  const { year, month } = WINDOWS[WINDOWS.length - 1]
  return new Date(Date.UTC(year, month - 2, 20)).toISOString().slice(0, 10)
})()

function group(overrides: Partial<WorkReportGroup> = {}): WorkReportGroup {
  return {
    id: 'group-1',
    label: 'SLR 2 — Ponedjeljak',
    startTime: '18:30',
    endTime: '20:00',
    ...overrides,
  }
}

function row(date: string, groupId = 'group-1'): WorkReportAttendanceRow {
  return { scheduledGroupId: groupId, sessionDate: new Date(`${date}T00:00:00.000Z`) }
}

function report(
  groups: WorkReportGroup[],
  rows: WorkReportAttendanceRow[],
  rateCents: number | null = null,
) {
  return buildTeacherWorkReport({ groups, rows, windows: WINDOWS, rateCents })
}

/** The month block for a `YYYY-MM`, so a test never depends on array position. */
function month(res: TeacherWorkReport, key: string) {
  const found = res.months.find((m) => m.window.startKey.startsWith(key))
  if (!found) throw new Error(`no month ${key} in the report`)
  return found
}

// The report deliberately carries no totals of its own — a six-month sum is not
// a figure anyone pays out. Tests that want one add it up here.
const sumSessions = (res: TeacherWorkReport) =>
  res.months.reduce((sum, m) => sum + m.sessionCount, 0)
const sumAmountCents = (res: TeacherWorkReport) =>
  res.months.reduce((sum, m) => sum + (m.amountCents ?? 0), 0)

describe('parseClockMinutes', () => {
  it('accepts one- and two-digit hours', () => {
    expect(parseClockMinutes('18:30')).toBe(18 * 60 + 30)
    expect(parseClockMinutes('9:00')).toBe(9 * 60)
    expect(parseClockMinutes(' 07:15 ')).toBe(7 * 60 + 15)
  })

  it('rejects missing and malformed values', () => {
    expect(parseClockMinutes(null)).toBeNull()
    expect(parseClockMinutes('')).toBeNull()
    expect(parseClockMinutes('18.30')).toBeNull()
    expect(parseClockMinutes('25:00')).toBeNull()
    expect(parseClockMinutes('18:75')).toBeNull()
  })
})

describe('sessionMinutes', () => {
  it('measures the usual class lengths', () => {
    expect(sessionMinutes('18:30', '20:00')).toBe(90)
    expect(sessionMinutes('17:00', '18:00')).toBe(60)
  })

  it('returns null when the range is unusable', () => {
    expect(sessionMinutes(null, '20:00')).toBeNull()
    expect(sessionMinutes('18:30', null)).toBeNull()
    expect(sessionMinutes('20:00', '18:30')).toBeNull()
    expect(sessionMinutes('18:30', '18:30')).toBeNull()
  })
})

describe('recentMonthWindows', () => {
  it('returns a full year of months, newest first', () => {
    const w = recentMonthWindows(new Date('2026-07-15T10:00:00.000Z'))

    expect(w).toHaveLength(REPORT_MONTH_COUNT)
    // Date keys, not Dates: these cross a 'use server' boundary via
    // getTeacherWorkReport, which returns serializable values only.
    expect(w[0]).toEqual({
      year: 2026,
      month: 7,
      startKey: '2026-07-01',
      endKey: '2026-07-31',
    })
    expect(w[1]).toEqual({
      year: 2026,
      month: 6,
      startKey: '2026-06-01',
      endKey: '2026-06-30',
    })
    // Twelve months back from July is the previous August, not January.
    expect(w.at(-1)).toEqual({
      year: 2025,
      month: 8,
      startKey: '2025-08-01',
      endKey: '2025-08-31',
    })
  })

  it('rolls back across the new year', () => {
    const w = recentMonthWindows(new Date('2026-01-10T10:00:00.000Z'))

    expect(w[0]).toMatchObject({ year: 2026, month: 1 })
    expect(w[1]).toMatchObject({ year: 2025, month: 12 })
    expect(w.at(-1)).toMatchObject({ year: 2025, month: 2 })
  })

  it('ends February on the right day in a leap year', () => {
    // A year-long window crosses a February on most days of the year, so the
    // "day 0 of the next month" trick has to hold for 29 days too.
    const w = recentMonthWindows(new Date('2028-03-15T10:00:00.000Z'), 2)

    expect(w[1]).toMatchObject({ year: 2028, month: 2, endKey: '2028-02-29' })
  })

  it('anchors on the Zagreb date, not UTC, at a month boundary', () => {
    // 23:30 UTC on 31 July is already 01 August in Zagreb (UTC+2).
    const w = recentMonthWindows(new Date('2026-07-31T23:30:00.000Z'))

    expect(w[0]).toMatchObject({ year: 2026, month: 8 })
    expect(w[1]).toMatchObject({ year: 2026, month: 7 })
  })

  it('honours a custom count', () => {
    expect(recentMonthWindows(new Date('2026-07-15T10:00:00.000Z'), 2)).toHaveLength(2)
  })
})

describe('buildTeacherWorkReport', () => {
  it('turns each attendance row into a session of the group length', () => {
    const res = report([group()], [row('2026-07-06'), row('2026-07-13')])

    expect(month(res, '2026-07')).toMatchObject({
      sessionCount: 2,
      groupCount: 1,
      totalMinutes: 180,
    })
    expect(month(res, '2026-07').groups[0].sessions).toEqual(['2026-07-06', '2026-07-13'])
  })

  it('reports every month in the window and drops rows older than it', () => {
    const res = report(
      [group()],
      [
        row('2026-07-06'),
        row('2026-06-29'),
        // Well back in the window — unreachable under the old two-month report.
        row('2026-03-10'),
        // The oldest month the report still reaches.
        row(`${OLDEST_KEY}-20`),
        row(BEFORE_WINDOW),
      ],
    )

    expect(res.months).toHaveLength(REPORT_MONTH_COUNT)
    expect(month(res, '2026-07').sessionCount).toBe(1)
    expect(month(res, '2026-06').sessionCount).toBe(1)
    expect(month(res, '2026-03').sessionCount).toBe(1)
    expect(month(res, OLDEST_KEY).sessionCount).toBe(1)
    // The row before the window is dropped, not folded into the oldest month.
    expect(sumSessions(res)).toBe(4)
    // A month with no work is still present, so the card renders a full year.
    expect(month(res, '2026-05')).toMatchObject({ sessionCount: 0, groups: [] })
  })

  it('collapses duplicate rows for the same group and date', () => {
    const res = report([group()], [row('2026-07-06'), row('2026-07-06')])

    expect(month(res, '2026-07').sessionCount).toBe(1)
    expect(month(res, '2026-07').totalMinutes).toBe(90)
  })

  it('lists a group without times, contributes no hours, and flags the month', () => {
    const res = report([group({ startTime: null, endTime: null })], [row('2026-07-06')], 1250)
    const july = month(res, '2026-07')

    expect(july.sessionCount).toBe(1)
    expect(july.totalMinutes).toBe(0)
    expect(july.groups[0].sessionMinutes).toBeNull()
    expect(july.groups[0].amountCents).toBe(0)
    // The total below those sessions is knowably short — the card says so.
    expect(july.hasUnpricedSessions).toBe(true)
  })

  it('totals across several groups, sorted by label', () => {
    const res = report(
      [
        group(),
        group({ id: 'group-2', label: 'SLR 1 — Utorak', startTime: '17:00', endTime: '18:00' }),
      ],
      [row('2026-07-06'), row('2026-07-07', 'group-2')],
    )
    const july = month(res, '2026-07')

    expect(july.groupCount).toBe(2)
    expect(july.sessionCount).toBe(2)
    expect(july.totalMinutes).toBe(150)
    expect(july.hasUnpricedSessions).toBe(false)
    expect(july.groups.map((g) => g.label)).toEqual([
      'SLR 1 — Utorak',
      'SLR 2 — Ponedjeljak',
    ])
  })

  it('ignores a row whose group is missing from the feed', () => {
    const res = report([group()], [row('2026-07-06', 'unknown-group')])

    expect(month(res, '2026-07').sessionCount).toBe(0)
    expect(month(res, '2026-07').groups).toEqual([])
  })

  it('returns empty months when nothing was recorded', () => {
    const res = report([group()], [])

    expect(res.months).toHaveLength(REPORT_MONTH_COUNT)
    expect(
      res.months.every(
        (m) => m.sessionCount === 0 && m.totalMinutes === 0 && m.groups.length === 0,
      ),
    ).toBe(true)
  })
})

describe('buildTeacherWorkReport — money', () => {
  it('leaves every amount null when no rate is set', () => {
    const res = report([group()], [row('2026-07-06')])

    expect(res.rateCents).toBeNull()
    expect(res.months.every((m) => m.amountCents === null)).toBe(true)
    expect(month(res, '2026-07').amountCents).toBeNull()
    expect(month(res, '2026-07').groups[0].amountCents).toBeNull()
    // Hours stay valid — only the money column disappears.
    expect(month(res, '2026-07').totalMinutes).toBe(90)
  })

  it('prices a 90-minute session at the hourly rate', () => {
    const res = report([group()], [row('2026-07-06')], 1250)

    expect(month(res, '2026-07').amountCents).toBe(1875)
    expect(sumAmountCents(res)).toBe(1875)
  })

  it('distinguishes a zero rate from no rate', () => {
    const res = report([group()], [row('2026-07-06')], 0)

    expect(res.months.every((m) => m.amountCents === 0)).toBe(true)
    expect(month(res, '2026-07').groups[0].amountCents).toBe(0)
  })

  it('keeps group subtotals adding up to the month total exactly', () => {
    // A rate that does not divide evenly, so rounding is actually exercised.
    const res = report(
      [
        group(),
        group({ id: 'group-2', label: 'SLR 1 — Utorak', startTime: '17:00', endTime: '18:00' }),
      ],
      [
        row('2026-07-06'),
        row('2026-07-07', 'group-2'),
        row('2026-07-13'),
        row('2026-06-01'),
      ],
      1233,
    )

    for (const m of res.months) {
      expect(m.amountCents).toBe(m.groups.reduce((sum, g) => sum + (g.amountCents ?? 0), 0))
    }
    // 180 min at 12,33 €/h = 36,99 €; the 60-min group adds 12,33 €.
    expect(month(res, '2026-07').groups.map((g) => g.amountCents)).toEqual([1233, 3699])
    expect(month(res, '2026-07').amountCents).toBe(4932)
    // June rounds a half cent up (90 min = 1849.5), which must not drift the sum.
    expect(month(res, '2026-06').amountCents).toBe(1850)
    expect(sumAmountCents(res)).toBe(6782)
  })

  it('rounds a half-cent session up rather than truncating it', () => {
    // 90 min at 12,33 €/h = 1849.5 cents.
    const res = report([group()], [row('2026-07-06')], 1233)

    expect(month(res, '2026-07').groups[0].amountCents).toBe(1850)
  })
})
