import { describe, expect, it } from 'vitest'
import {
  buildTeacherWorkReport,
  monthWindows,
  parseClockMinutes,
  sessionMinutes,
  type WorkReportAttendanceRow,
  type WorkReportGroup,
} from '@/lib/teacher-work-report'

const WINDOWS = monthWindows(new Date('2026-07-15T10:00:00.000Z'))

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

function report(groups: WorkReportGroup[], rows: WorkReportAttendanceRow[]) {
  return buildTeacherWorkReport({ groups, rows, windows: WINDOWS })
}

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

describe('monthWindows', () => {
  it('spans the current month and the one before it', () => {
    const w = monthWindows(new Date('2026-07-15T10:00:00.000Z'))
    // Date keys, not Dates: these cross a 'use server' boundary via
    // getTeacherWorkReport, which returns serializable values only.
    expect(w.current).toEqual({
      year: 2026,
      month: 7,
      startKey: '2026-07-01',
      endKey: '2026-07-31',
    })
    expect(w.previous).toEqual({
      year: 2026,
      month: 6,
      startKey: '2026-06-01',
      endKey: '2026-06-30',
    })
  })

  it('rolls the previous month across the new year', () => {
    const w = monthWindows(new Date('2026-01-10T10:00:00.000Z'))
    expect(w.previous).toMatchObject({ year: 2025, month: 12 })
  })

  it('anchors on the Zagreb date, not UTC, at a month boundary', () => {
    // 23:30 UTC on 31 July is already 01 August in Zagreb (UTC+2).
    const w = monthWindows(new Date('2026-07-31T23:30:00.000Z'))
    expect(w.current).toMatchObject({ year: 2026, month: 8 })
    expect(w.previous).toMatchObject({ year: 2026, month: 7 })
  })
})

describe('buildTeacherWorkReport', () => {
  it('turns each attendance row into a session of the group length', () => {
    const res = report([group()], [row('2026-07-06'), row('2026-07-13')])

    expect(res.current.sessionCount).toBe(2)
    expect(res.current.groupCount).toBe(1)
    expect(res.current.totalMinutes).toBe(180)
    expect(res.current.groups[0].sessions).toEqual(['2026-07-06', '2026-07-13'])
  })

  it('splits into the current and previous month and drops older rows', () => {
    const res = report(
      [group()],
      [
        row('2026-07-06'),
        row('2026-06-29'),
        row('2026-06-01'),
        row('2026-05-25'),
      ],
    )

    expect(res.current.sessionCount).toBe(1)
    expect(res.previous.sessionCount).toBe(2)
    expect(res.previous.totalMinutes).toBe(180)
  })

  it('collapses duplicate rows for the same group and date', () => {
    const res = report([group()], [row('2026-07-06'), row('2026-07-06')])

    expect(res.current.sessionCount).toBe(1)
    expect(res.current.totalMinutes).toBe(90)
  })

  it('lists a group without times but contributes no hours', () => {
    const res = report([group({ startTime: null, endTime: null })], [row('2026-07-06')])

    expect(res.current.sessionCount).toBe(1)
    expect(res.current.totalMinutes).toBe(0)
    expect(res.current.groups[0].sessionMinutes).toBeNull()
  })

  it('totals across several groups, sorted by label', () => {
    const res = report(
      [
        group(),
        group({ id: 'group-2', label: 'SLR 1 — Utorak', startTime: '17:00', endTime: '18:00' }),
      ],
      [row('2026-07-06'), row('2026-07-07', 'group-2')],
    )

    expect(res.current.groupCount).toBe(2)
    expect(res.current.sessionCount).toBe(2)
    expect(res.current.totalMinutes).toBe(150)
    expect(res.current.groups.map((g) => g.label)).toEqual([
      'SLR 1 — Utorak',
      'SLR 2 — Ponedjeljak',
    ])
  })

  it('ignores a row whose group is missing from the feed', () => {
    const res = report([group()], [row('2026-07-06', 'unknown-group')])

    expect(res.current.sessionCount).toBe(0)
    expect(res.current.groups).toEqual([])
  })

  it('returns empty months when nothing was recorded', () => {
    const res = report([group()], [])

    expect(res.current).toMatchObject({ totalMinutes: 0, sessionCount: 0, groupCount: 0 })
    expect(res.previous.groups).toEqual([])
  })
})
