/**
 * Monthly teaching-hours report — the payout basis for hourly-paid teachers.
 *
 * Hours come from `TeacherAttendance` and nothing else: one present row per
 * (teacher, group, sessionDate), worth the group's `endTime − startTime`. Who
 * typed the attendance in is irrelevant, and so is whether the teacher is still
 * assigned to the group — the rows outlive the assignment on purpose, so a
 * stand-in or a mid-year reshuffle can't rewrite a month that was already paid.
 *
 * Pure module — no Prisma, no auth. `getTeacherWorkReport` feeds it rows.
 */

import { toDateKey } from './session-dates'
import { zagrebDateKey } from './attendance-window'

export type WorkReportGroup = {
  id: string
  label: string
  startTime: string | null
  endTime: string | null
}

/** One present `TeacherAttendance` row for the teacher being reported. */
export type WorkReportAttendanceRow = {
  scheduledGroupId: string
  sessionDate: Date
}

export type MonthWindow = {
  year: number
  /** 1-12. */
  month: number
  /** UTC midnight of the 1st. */
  start: Date
  /** UTC midnight of the last day, inclusive. */
  end: Date
}

export type WorkReportGroupSummary = {
  groupId: string
  label: string
  startTime: string | null
  endTime: string | null
  /** Null when the group has no usable time range. */
  sessionMinutes: number | null
  sessionCount: number
  totalMinutes: number
  /** YYYY-MM-DD, ascending. */
  sessions: string[]
}

export type WorkReportMonth = {
  window: MonthWindow
  totalMinutes: number
  sessionCount: number
  groupCount: number
  groups: WorkReportGroupSummary[]
}

export type TeacherWorkReport = {
  current: WorkReportMonth
  previous: WorkReportMonth
}

/** Minutes since midnight from "H:MM" / "HH:MM"; null when unparseable. */
export function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Class length in minutes. Null when either bound is missing or the range is
 * not positive — legacy/imported groups without times still list their
 * sessions, they just contribute no hours.
 */
export function sessionMinutes(
  startTime: string | null,
  endTime: string | null,
): number | null {
  const start = parseClockMinutes(startTime)
  const end = parseClockMinutes(endTime)
  if (start === null || end === null) return null
  const length = end - start
  return length > 0 ? length : null
}

function monthWindow(year: number, month: number): MonthWindow {
  return {
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1)),
    // Day 0 of the next month = last day of this one.
    end: new Date(Date.UTC(year, month, 0)),
  }
}

/**
 * Current + previous calendar month, anchored on the **Europe/Zagreb** date so
 * the 1st of the month doesn't flip a couple of hours early on a UTC server.
 * `sessionDate` is a `@db.Date` at UTC midnight, so the resulting bounds
 * compare exactly.
 */
export function monthWindows(now: Date): { current: MonthWindow; previous: MonthWindow } {
  const key = zagrebDateKey(now)
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  return {
    current: monthWindow(year, month),
    previous: month === 1 ? monthWindow(year - 1, 12) : monthWindow(year, month - 1),
  }
}

function inWindow(date: string, window: MonthWindow): boolean {
  return date >= toDateKey(window.start) && date <= toDateKey(window.end)
}

function finalizeMonth(
  window: MonthWindow,
  byGroup: Map<string, Set<string>>,
  groupById: Map<string, WorkReportGroup>,
): WorkReportMonth {
  const groups: WorkReportGroupSummary[] = []
  let totalMinutes = 0
  let sessionCount = 0

  for (const [groupId, dates] of byGroup) {
    const group = groupById.get(groupId)
    if (!group) continue
    const minutes = sessionMinutes(group.startTime, group.endTime)
    const sessions = Array.from(dates).sort((a, b) => a.localeCompare(b))
    const subtotal = (minutes ?? 0) * sessions.length
    totalMinutes += subtotal
    sessionCount += sessions.length
    groups.push({
      groupId,
      label: group.label,
      startTime: group.startTime,
      endTime: group.endTime,
      sessionMinutes: minutes,
      sessionCount: sessions.length,
      totalMinutes: subtotal,
      sessions,
    })
  }

  groups.sort((a, b) => a.label.localeCompare(b.label, 'hr'))

  return {
    window,
    totalMinutes,
    sessionCount,
    groupCount: groups.length,
    groups,
  }
}

/**
 * Build the two-month report from one teacher's present attendance rows.
 * Duplicate (group, date) pairs collapse into a single session.
 */
export function buildTeacherWorkReport(input: {
  groups: WorkReportGroup[]
  rows: WorkReportAttendanceRow[]
  windows: { current: MonthWindow; previous: MonthWindow }
}): TeacherWorkReport {
  const { groups, rows, windows } = input
  const groupById = new Map(groups.map((g) => [g.id, g]))

  const current = new Map<string, Set<string>>()
  const previous = new Map<string, Set<string>>()

  for (const row of rows) {
    const date = toDateKey(row.sessionDate)
    let bucket: Map<string, Set<string>>
    if (inWindow(date, windows.current)) bucket = current
    else if (inWindow(date, windows.previous)) bucket = previous
    else continue

    const dates = bucket.get(row.scheduledGroupId) ?? new Set<string>()
    dates.add(date)
    bucket.set(row.scheduledGroupId, dates)
  }

  return {
    current: finalizeMonth(windows.current, current, groupById),
    previous: finalizeMonth(windows.previous, previous, groupById),
  }
}
