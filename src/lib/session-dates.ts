/**
 * Helpers to compute expected class-session dates for a ScheduledGroup.
 *
 * A "session" is the combination of (ScheduledGroup, sessionDate). We don't
 * store a separate ClassSession model — instead, the expected dates are
 * derived on the fly from:
 *   - the group's `dayOfWeek` (Croatian weekday name), and
 *   - the ModuleSchedule windows (startDate..endDate) for the current school
 *     year on the group's course.
 *
 * If a week would produce a session that sits outside every module window
 * (e.g. winter break), it is skipped. Cancelled sessions (snow day, holiday)
 * are the teacher's call — they simply leave the row unmarked or write a note.
 */

import { zagrebDateKey } from './attendance-window'

const DAY_INDEX: Record<string, number> = {
  // 0 = Sunday to match JS Date.getUTCDay()
  Nedjelja: 0,
  Ponedjeljak: 1,
  Utorak: 2,
  Srijeda: 3,
  Četvrtak: 4,
  Cetvrtak: 4,
  Petak: 5,
  Subota: 6,
}

const DAY_MS = 86_400_000

function parseCroatianWeekday(name: string | null | undefined): number | null {
  if (!name) return null
  const key = name.trim()
  const idx = DAY_INDEX[key]
  return typeof idx === 'number' ? idx : null
}

export function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/**
 * Collect the first `count` non-holiday occurrences of `weekdayName` on or
 * after `start`. Returns up to `count` dates; fewer if a pathological holiday
 * set would push the search past MAX_WEEKS. Used by both the school-year
 * planner (slowest-weekday's 7th session, n=7) and the per-group module arc
 * (a group's 7 sessions of one module).
 */
export function collectWeekdaySessions(
  start: Date,
  weekdayName: string,
  holidays: ReadonlySet<string>,
  count: number,
): Date[] {
  const weekday = parseCroatianWeekday(weekdayName)
  if (weekday === null || count <= 0) return []
  const MAX_WEEKS = 520 // ~10 years — far beyond any real school-year input
  let cur = utcMidnight(start)
  while (cur.getUTCDay() !== weekday) cur = new Date(cur.getTime() + DAY_MS)
  const out: Date[] = []
  for (let i = 0; i < MAX_WEEKS && out.length < count; i++) {
    if (!holidays.has(toDateKey(cur))) out.push(cur)
    cur = new Date(cur.getTime() + 7 * DAY_MS)
  }
  return out
}

/**
 * Convenience: nth non-holiday occurrence of `weekdayName` on or after `start`.
 * Throws if fewer than n occurrences exist within MAX_WEEKS — callers that
 * tolerate "not enough sessions" should use `collectWeekdaySessions` directly.
 */
export function nthWeekdaySession(
  start: Date,
  weekdayName: string,
  holidays: ReadonlySet<string>,
  n: number,
): Date {
  const sessions = collectWeekdaySessions(start, weekdayName, holidays, n)
  if (sessions.length < n) {
    throw new Error(
      `nthWeekdaySession: did not find session #${n} for ${weekdayName} on or after ${toDateKey(start)}`,
    )
  }
  return sessions[n - 1]
}

/**
 * Convert a `Date` (usually at UTC midnight from Prisma `@db.Date`) into a
 * canonical "YYYY-MM-DD" string — used as the stable key when comparing
 * records and expected sessions.
 */
export function toDateKey(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. */
export function fromDateKey(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) throw new Error(`Invalid date key: ${key}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

type ModuleWindow = {
  startDate: Date | null
  endDate: Date | null
}

/**
 * Compute every weekly session date implied by the group's weekday + the
 * supplied module windows. Returns an ascending list of UTC-midnight dates
 * with no duplicates (overlapping windows are merged). Holiday dates (passed
 * as YYYY-MM-DD keys via `holidayDates`) are dropped from the result.
 */
export function computeExpectedSessions(input: {
  dayOfWeek: string | null
  moduleWindows: ModuleWindow[]
  holidayDates?: ReadonlySet<string>
}): Date[] {
  const weekday = parseCroatianWeekday(input.dayOfWeek)
  if (weekday === null) return []

  const windows = input.moduleWindows
    .filter((w): w is { startDate: Date; endDate: Date } =>
      w.startDate !== null && w.endDate !== null,
    )
    .map((w) => ({
      start: new Date(Date.UTC(w.startDate.getUTCFullYear(), w.startDate.getUTCMonth(), w.startDate.getUTCDate())),
      end: new Date(Date.UTC(w.endDate.getUTCFullYear(), w.endDate.getUTCMonth(), w.endDate.getUTCDate())),
    }))
  if (windows.length === 0) return []

  const holidays = input.holidayDates
  const seen = new Set<string>()
  const out: Date[] = []

  for (const { start, end } of windows) {
    // Advance to the first occurrence of `weekday` on/after `start`.
    let cur = start
    while (cur.getUTCDay() !== weekday) {
      cur = new Date(cur.getTime() + DAY_MS)
    }
    while (cur.getTime() <= end.getTime()) {
      const key = toDateKey(cur)
      if (!seen.has(key) && !(holidays?.has(key) ?? false)) {
        seen.add(key)
        out.push(new Date(cur))
      }
      cur = new Date(cur.getTime() + 7 * DAY_MS)
    }
  }

  out.sort((a, b) => a.getTime() - b.getTime())
  return out
}

/**
 * The group's probni sat date — the single occurrence of its weekday inside the
 * trial week, or none.
 *
 * A one-line delegate to {@link computeExpectedSessions}, exactly how
 * `computeSeasonSessions` is written. A calendar week contains exactly one of
 * each weekday, so the result is 0 or 1 date, and holiday-awareness comes free:
 * a public holiday landing on the group's day removes its trial rather than
 * moving it, which matches how the rest of the app treats a lost week.
 *
 * Returns null when the year has no trial week, the group has no weekday
 * (radionice), or a holiday took it.
 */
export function computeTrialSession(input: {
  dayOfWeek: string | null
  startDate: Date | null
  endDate: Date | null
  holidayDates?: ReadonlySet<string>
}): Date | null {
  const [date] = computeExpectedSessions({
    dayOfWeek: input.dayOfWeek,
    moduleWindows: [{ startDate: input.startDate, endDate: input.endDate }],
    holidayDates: input.holidayDates,
  })
  return date ?? null
}

/**
 * Weekly sessions for a COMPETITION group: every occurrence of `dayOfWeek`
 * inside the program's season, minus holidays.
 *
 * Deliberately has no session-count target and no make-up logic — a holiday
 * landing on a group's weekday simply removes that week. Two groups meeting on
 * different weekdays can therefore end the season with different totals, which
 * is the intended behaviour: the competitive track is paced by the calendar,
 * not by a fixed curriculum length.
 *
 * Returns [] when the season is unplanned or the weekday is missing.
 */
export function computeSeasonSessions(input: {
  dayOfWeek: string | null
  startDate: Date | null
  endDate: Date | null
  holidayDates?: ReadonlySet<string>
}): Date[] {
  return computeExpectedSessions({
    dayOfWeek: input.dayOfWeek,
    moduleWindows: [{ startDate: input.startDate, endDate: input.endDate }],
    holidayDates: input.holidayDates,
  })
}

/** Return today's date as a UTC-midnight `Date` (matching `@db.Date` storage). */
export function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/**
 * Whether a radionica group may still be offered as a termin on the public
 * signup form.
 *
 * A workshop runs once, on a closed [dateStart, dateEnd] range, so a parent can
 * only usefully join one that has not begun: an inquiry still has to be read and
 * turned into an account by an admin ("kontaktiramo vas u roku 48h"), which a
 * workshop starting today or already finished cannot wait for. The cutoff is the
 * **start** day — from midnight of `dateStart` onward the group drops out of the
 * form, which covers "already running" and "long over" in one rule.
 *
 * Anchored on the Europe/Zagreb calendar day so the group doesn't vanish a
 * couple of hours early on a UTC server. `YYYY-MM-DD` keys compare correctly as
 * strings, so nothing here can drift across a timezone boundary.
 *
 * A radionica group with no dates (the admin form accepts both bounds blank)
 * has no start to compare against and stays bookable — hiding it would silently
 * remove a termin over missing data rather than over an expired one.
 */
export function isRadionicaOpenForSignup(
  dateStart: string | null,
  now: Date,
): boolean {
  if (!dateStart) return true
  return dateStart > zagrebDateKey(now)
}

/**
 * Enumerate every calendar day in the closed YYYY-MM-DD range [dateStart, dateEnd],
 * skipping holidays AND Sundays. Used by radionice attendance: each day in the
 * range is one expected session. Sundays are excluded because the association
 * never schedules workshops on Nedjelja (matches `ACTIVE_WEEKDAYS` which lists
 * only Pon-Sub for standard programs).
 * Returns an empty list when either bound is missing or end < start.
 */
export function computeRadionicaSessions(input: {
  dateStart: string | null
  dateEnd: string | null
  holidayDates?: ReadonlySet<string>
}): Date[] {
  if (!input.dateStart || !input.dateEnd) return []
  const start = fromDateKey(input.dateStart).getTime()
  const end = fromDateKey(input.dateEnd).getTime()
  if (end < start) return []

  const holidays = input.holidayDates
  const out: Date[] = []
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t)
    if (d.getUTCDay() === 0) continue // Sunday — never a workshop day
    if (holidays?.has(toDateKey(d))) continue
    out.push(d)
  }
  return out
}
