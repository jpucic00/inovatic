/**
 * Monthly teaching-hours report — the payout basis for hourly-paid teachers.
 *
 * Hours come from `TeacherAttendance` and nothing else: one present row per
 * (teacher, group, sessionDate), worth the group's `endTime − startTime`. Who
 * typed the attendance in is irrelevant, and so is whether the teacher is still
 * assigned to the group — the rows outlive the assignment on purpose, so a
 * stand-in or a mid-year reshuffle can't rewrite a month that was already paid.
 *
 * Money is layered on top of that, never mixed into it: the teacher's rate is a
 * single **current** value (`User.hourlyRateCents`), so every month in the
 * window is priced at today's rate. That is a deliberate simplification — the
 * card says so — and it is why the hours half of every type stays valid when
 * `rateCents` is null, in which case every amount is null rather than 0.
 *
 * Pure module — no Prisma, no auth. `getTeacherWorkReport` feeds it rows.
 */

import { toDateKey } from './session-dates'
import { zagrebDateKey } from './attendance-window'

/**
 * How many calendar months the admin report covers, current month first — a
 * full year, so any month of a school year is still reachable from any other.
 * Every month is emitted worked or not, so this is also exactly how many rows
 * the card renders; they are collapsed `<details>`, so the cost of raising it
 * is one query bound, not markup.
 */
export const REPORT_MONTH_COUNT = 12

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
  /** YYYY-MM-DD of the 1st. */
  startKey: string
  /** YYYY-MM-DD of the last day, inclusive. */
  endKey: string
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
  /** Euro cents owed for this group's sessions; null when no rate is set. */
  amountCents: number | null
  /** YYYY-MM-DD, ascending. */
  sessions: string[]
}

export type WorkReportMonth = {
  window: MonthWindow
  totalMinutes: number
  sessionCount: number
  groupCount: number
  /** Sum of the group amounts, so the visible rows add up to the visible total. */
  amountCents: number | null
  /**
   * True when a group in this month has no usable time range: its sessions are
   * listed but priced at nothing, so the total below them is knowably short.
   */
  hasUnpricedSessions: boolean
  groups: WorkReportGroupSummary[]
}

/**
 * Deliberately no report-wide totals: a six-month sum is not a figure anyone
 * pays out, and putting one above the months made the current month — the one
 * that is actually being settled — read as a detail of it. The months carry
 * their own totals and the current one leads the list.
 */
export type TeacherWorkReport = {
  /** `REPORT_MONTH_COUNT` months, newest first; a month with no work is present and empty. */
  months: WorkReportMonth[]
  /** The rate every amount here was computed at, for the card to name. */
  rateCents: number | null
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

/** Euro cents for a stretch of minutes; null keeps "no rate set" distinct from "0 €". */
function amountForMinutes(minutes: number, rateCents: number | null): number | null {
  if (rateCents === null) return null
  return Math.round((minutes * rateCents) / 60)
}

function monthWindow(year: number, month: number): MonthWindow {
  return {
    year,
    month,
    startKey: toDateKey(new Date(Date.UTC(year, month - 1, 1))),
    // Day 0 of the next month = last day of this one.
    endKey: toDateKey(new Date(Date.UTC(year, month, 0))),
  }
}

/** A window's bucket key — `YYYY-MM`, the same slice a session date yields. */
function monthKey(window: MonthWindow): string {
  return window.startKey.slice(0, 7)
}

/**
 * The last `count` calendar months, **newest first**, anchored on the
 * **Europe/Zagreb** date so the 1st doesn't flip a couple of hours early on a
 * UTC server. `sessionDate` is a `@db.Date` at UTC midnight, so the resulting
 * bounds compare exactly.
 */
export function recentMonthWindows(
  now: Date,
  count = REPORT_MONTH_COUNT,
): MonthWindow[] {
  const key = zagrebDateKey(now)
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  return Array.from({ length: count }, (_, back) => {
    // A negative month index rolls the year back for us.
    const anchor = new Date(Date.UTC(year, month - 1 - back, 1))
    return monthWindow(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1)
  })
}

function finalizeMonth(
  window: MonthWindow,
  byGroup: Map<string, Set<string>>,
  groupById: Map<string, WorkReportGroup>,
  rateCents: number | null,
): WorkReportMonth {
  const groups: WorkReportGroupSummary[] = []
  let totalMinutes = 0
  let sessionCount = 0
  let amountCents = rateCents === null ? null : 0
  let hasUnpricedSessions = false

  for (const [groupId, dates] of byGroup) {
    const group = groupById.get(groupId)
    if (!group) continue
    const minutes = sessionMinutes(group.startTime, group.endTime)
    if (minutes === null) hasUnpricedSessions = true
    const sessions = Array.from(dates).sort((a, b) => a.localeCompare(b))
    const subtotal = (minutes ?? 0) * sessions.length
    const groupAmount = amountForMinutes(subtotal, rateCents)
    totalMinutes += subtotal
    sessionCount += sessions.length
    if (amountCents !== null) amountCents += groupAmount ?? 0
    groups.push({
      groupId,
      label: group.label,
      startTime: group.startTime,
      endTime: group.endTime,
      sessionMinutes: minutes,
      sessionCount: sessions.length,
      totalMinutes: subtotal,
      amountCents: groupAmount,
      sessions,
    })
  }

  groups.sort((a, b) => a.label.localeCompare(b.label, 'hr'))

  return {
    window,
    totalMinutes,
    sessionCount,
    groupCount: groups.length,
    amountCents,
    hasUnpricedSessions,
    groups,
  }
}

/**
 * Build the report from one teacher's present attendance rows. Every requested
 * window gets a month, worked or not. Duplicate (group, date) pairs collapse
 * into a single session; rows outside the windows are ignored.
 */
export function buildTeacherWorkReport(input: {
  groups: WorkReportGroup[]
  rows: WorkReportAttendanceRow[]
  windows: MonthWindow[]
  rateCents: number | null
}): TeacherWorkReport {
  const { groups, rows, windows, rateCents } = input
  const groupById = new Map(groups.map((g) => [g.id, g]))

  // Pre-seeded from the windows, so a row's own YYYY-MM decides its bucket in
  // one lookup and anything outside the report falls out with no range scan.
  const buckets = new Map<string, Map<string, Set<string>>>(
    windows.map((w) => [monthKey(w), new Map<string, Set<string>>()]),
  )

  for (const row of rows) {
    const date = toDateKey(row.sessionDate)
    const bucket = buckets.get(date.slice(0, 7))
    if (!bucket) continue

    const dates = bucket.get(row.scheduledGroupId) ?? new Set<string>()
    dates.add(date)
    bucket.set(row.scheduledGroupId, dates)
  }

  return {
    months: windows.map((w) =>
      finalizeMonth(w, buckets.get(monthKey(w)) ?? new Map(), groupById, rateCents),
    ),
    rateCents,
  }
}
