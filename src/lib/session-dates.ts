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

function parseCroatianWeekday(name: string | null | undefined): number | null {
  if (!name) return null
  const key = name.trim()
  const idx = DAY_INDEX[key]
  return typeof idx === 'number' ? idx : null
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

  const DAY_MS = 86_400_000
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

/** Return today's date as a UTC-midnight `Date` (matching `@db.Date` storage). */
export function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
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

  const DAY_MS = 86_400_000
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
