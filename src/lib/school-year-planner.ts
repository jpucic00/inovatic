/**
 * School-year planning math.
 *
 * Used in two directions:
 *   - `/admin/skolska-godina` planner — admin enters a kickoff date, we project
 *     4 module windows (7 sessions per module, holiday-aware) and per-weekday
 *     boundary dates so the calendar can render the preview live.
 *   - "Dovrši plan" server action — re-runs the same math server-side and
 *     persists the computed (startDate, endDate) pairs into ModuleSchedule.
 *
 * Pure functions only — `session-dates.ts` is the date-stepping primitive,
 * this file composes it into the 4×7 = 28-session curriculum.
 */
import { STANDARD_PROGRAM_SESSION_TARGET } from '@/lib/constants'
import { ACTIVE_WEEKDAYS, type ActiveWeekday } from '@/lib/group-end-dates'
import { computeExpectedSessions, fromDateKey, toDateKey } from '@/lib/session-dates'

const SESSIONS_PER_MODULE = 7
export const MODULE_COUNT = 4

const DAY_MS = 86_400_000

const DAY_INDEX: Record<string, number> = {
  Nedjelja: 0,
  Ponedjeljak: 1,
  Utorak: 2,
  Srijeda: 3,
  Četvrtak: 4,
  Cetvrtak: 4,
  Petak: 5,
  Subota: 6,
}

const SHORT_WEEKDAY: Record<string, string> = {
  Nedjelja: 'Ned',
  Ponedjeljak: 'Pon',
  Utorak: 'Uto',
  Srijeda: 'Sri',
  Četvrtak: 'Čet',
  Cetvrtak: 'Čet',
  Petak: 'Pet',
  Subota: 'Sub',
}

type ModuleIndex = 1 | 2 | 3 | 4

type PlannedModuleWindow = {
  moduleIndex: ModuleIndex
  startDate: Date // UTC midnight
  endDate: Date // UTC midnight
}

/**
 * Single marker placed on the calendar at the first or last session date of a
 * weekday inside a module's window. Identical-shape replacement for the
 * previously inline `ModuleMarker` type in `holiday-calendar.tsx` — calendar
 * imports it from here now so the prop contract has one source.
 *
 * `moduleIndex` is `sortOrder + 1` — the 1-based ordinal a cell can render as
 * "M1 / M2 / M3 / M4" without re-parsing the title.
 */
export type ModuleMarker = {
  date: string // YYYY-MM-DD
  kind: 'start' | 'end'
  moduleIndex: number // 1-based: 1, 2, 3, 4 for standard programs
  label: string // module title (used in the dialog list)
  tooltip: string // full "<courses> · <module> — početak/kraj (<wday>)"
}

type SessionDerivation = {
  /** YYYY-MM-DD lists, ≤ STANDARD_PROGRAM_SESSION_TARGET (28) per weekday. */
  sessionDatesByWeekday: Record<ActiveWeekday, string[]>
  /** 28th-session key per weekday, or null if fewer than 28 are projected. */
  lastSessionDateByWeekday: Record<ActiveWeekday, string | null>
}

type SchoolYearPlan = SessionDerivation & {
  modules: PlannedModuleWindow[] // length 4 (or all-zero stub on empty active set)
}

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function emptyByWeekday<V>(make: () => V): Record<ActiveWeekday, V> {
  const out = {} as Record<ActiveWeekday, V>
  for (const w of ACTIVE_WEEKDAYS) out[w] = make()
  return out
}

function filterActiveWeekdays(input: ReadonlyArray<string>): ActiveWeekday[] {
  const set = new Set<string>(ACTIVE_WEEKDAYS)
  // Preserve ACTIVE_WEEKDAYS order regardless of input order so plan results
  // are stable across permutations of the caller's array.
  return ACTIVE_WEEKDAYS.filter((w) => set.has(w) && input.includes(w))
}

/**
 * Find the n-th occurrence of `weekday` on/after `start`, skipping holidays.
 * Open-ended (no end cap) — the planner uses this to ask "where is the 7th
 * Monday counting from this module's start?" before deciding the module's
 * endDate. Bounded at MAX_WEEKS to fail loudly if a pathological holiday set
 * keeps consuming every candidate.
 */
function nthSessionOnOrAfter(
  start: Date,
  weekday: number,
  holidays: ReadonlySet<string>,
  n: number,
): Date {
  const MAX_WEEKS = 520 // ~10 years — far beyond any real school-year input
  let cur = utcMidnight(start)
  while (cur.getUTCDay() !== weekday) cur = addDays(cur, 1)
  let collected = 0
  for (let i = 0; i < MAX_WEEKS; i++) {
    if (!holidays.has(toDateKey(cur))) {
      collected++
      if (collected === n) return cur
    }
    cur = addDays(cur, 7)
  }
  throw new Error(
    `nthSessionOnOrAfter: did not find session #${n} within ${MAX_WEEKS} weeks`,
  )
}

function deriveSessionsForWeekdays(input: {
  moduleWindows: ReadonlyArray<{ startDate: Date | null; endDate: Date | null }>
  activeWeekdays: ReadonlyArray<ActiveWeekday>
  holidayDates: ReadonlySet<string>
}): SessionDerivation {
  // computeExpectedSessions takes a mutable array — copy once so the caller
  // can pass the readonly result of `Array.map`.
  const moduleWindows = [...input.moduleWindows]
  const sessionDatesByWeekday = emptyByWeekday<string[]>(() => [])
  const lastSessionDateByWeekday = emptyByWeekday<string | null>(() => null)
  for (const w of input.activeWeekdays) {
    const sessions = computeExpectedSessions({
      dayOfWeek: w,
      moduleWindows,
      holidayDates: input.holidayDates,
    }).slice(0, STANDARD_PROGRAM_SESSION_TARGET)
    sessionDatesByWeekday[w] = sessions.map(toDateKey)
    lastSessionDateByWeekday[w] =
      sessions.length >= STANDARD_PROGRAM_SESSION_TARGET
        ? (sessionDatesByWeekday[w].at(-1) ?? null)
        : null
  }
  return { sessionDatesByWeekday, lastSessionDateByWeekday }
}

/**
 * Project 4 module windows + per-weekday session lists from a single kickoff
 * date. Every active weekday is guaranteed to get exactly
 * SESSIONS_PER_MODULE (7) sessions inside each module's window, because the
 * module's endDate is anchored on the slowest weekday's 7th session.
 *
 * Module N+1.startDate = Module N.endDate + 1 day. No explicit gap (winter
 * break and similar are folded in via the holiday set).
 *
 * Empty active-weekday input returns 4 zero-length modules at `startDate` —
 * the wrapper view should disable the Complete button in that case, but the
 * shape stays stable so the UI doesn't need branchy fallbacks.
 */
export function computeSchoolYearPlan(input: {
  startDate: Date
  activeWeekdays: ReadonlyArray<string>
  holidayDates: ReadonlySet<string>
}): SchoolYearPlan {
  const startUtc = utcMidnight(input.startDate)
  const activeWeekdays = filterActiveWeekdays(input.activeWeekdays)

  if (activeWeekdays.length === 0) {
    return {
      modules: Array.from({ length: MODULE_COUNT }, (_, i) => ({
        moduleIndex: (i + 1) as ModuleIndex,
        startDate: startUtc,
        endDate: startUtc,
      })),
      sessionDatesByWeekday: emptyByWeekday(() => []),
      lastSessionDateByWeekday: emptyByWeekday(() => null),
    }
  }

  const modules: PlannedModuleWindow[] = []
  let moduleStart = startUtc
  for (let i = 0; i < MODULE_COUNT; i++) {
    let moduleEnd = moduleStart
    for (const w of activeWeekdays) {
      const weekdayIdx = DAY_INDEX[w]
      if (weekdayIdx === undefined) continue
      const seventh = nthSessionOnOrAfter(
        moduleStart,
        weekdayIdx,
        input.holidayDates,
        SESSIONS_PER_MODULE,
      )
      if (seventh.getTime() > moduleEnd.getTime()) moduleEnd = seventh
    }
    modules.push({
      moduleIndex: (i + 1) as ModuleIndex,
      startDate: moduleStart,
      endDate: moduleEnd,
    })
    moduleStart = addDays(moduleEnd, 1)
  }

  const moduleWindows = modules.map((m) => ({
    startDate: m.startDate,
    endDate: m.endDate,
  }))
  return {
    modules,
    ...deriveSessionsForWeekdays({
      moduleWindows,
      activeWeekdays,
      holidayDates: input.holidayDates,
    }),
  }
}

/**
 * Build per-weekday session lists (capped at 28) from already-committed
 * ModuleSchedule windows. Always derives for all 6 weekdays (Pon–Sub) — the
 * calendar is a pure projection of the schedule, independent of which
 * weekdays currently have ScheduledGroups. Group existence only matters for
 * attendance, not for the calendar.
 */
export function deriveSessionDatesFromWindows(input: {
  moduleWindows: ReadonlyArray<{ startDate: Date | null; endDate: Date | null }>
  holidayDates: ReadonlySet<string>
}): SessionDerivation {
  return deriveSessionsForWeekdays({
    moduleWindows: input.moduleWindows,
    activeWeekdays: ACTIVE_WEEKDAYS,
    holidayDates: input.holidayDates,
  })
}

type ModuleMarkerInputCourse = {
  courseId: string
  /** Pre-formatted display label (e.g. "SLR 1" or course title). */
  courseLabel: string
  modules: ReadonlyArray<{
    sortOrder: number
    title: string
    startDate: Date | null
    endDate: Date | null
  }>
}

/**
 * Per-day workshop (radionica) label: the Course.title of any radionica whose
 * [dateStart, dateEnd] range covers this date. Multiple radionice on the same
 * day get distinct entries (deduped by title); the calendar renders them
 * stacked under the day number.
 */
export type WorkshopLabel = {
  date: string // YYYY-MM-DD
  title: string // Course.title
}

/**
 * Enumerate every day in [dateStart, dateEnd] (inclusive, YYYY-MM-DD keys) for
 * each radionica group + emit one label per (date, course.title). Deduped per
 * day so two groups of the same workshop on the same day collapse to one
 * label. Holiday-aware: a radionica scheduled on a holiday still surfaces
 * because the admin needs to see the conflict. Attendance computation handles
 * the holiday skip separately.
 */
export function computeWorkshopLabels(input: {
  radionicaGroups: ReadonlyArray<{
    dateStart: string | null
    dateEnd: string | null
    courseTitle: string
  }>
}): WorkshopLabel[] {
  type DayEntry = { titles: Set<string> }
  const byDate = new Map<string, DayEntry>()

  for (const g of input.radionicaGroups) {
    if (!g.dateStart || !g.dateEnd) continue
    let cur = fromDateKey(g.dateStart).getTime()
    const end = fromDateKey(g.dateEnd).getTime()
    if (end < cur) continue
    while (cur <= end) {
      const key = toDateKey(new Date(cur))
      let entry = byDate.get(key)
      if (!entry) {
        entry = { titles: new Set() }
        byDate.set(key, entry)
      }
      entry.titles.add(g.courseTitle)
      cur += DAY_MS
    }
  }

  const out: WorkshopLabel[] = []
  for (const [date, entry] of byDate) {
    for (const title of [...entry.titles].sort()) {
      out.push({ date, title })
    }
  }
  out.sort((a, b) =>
    a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? -1 : 1,
  )
  return out
}

/**
 * For every (course × module × weekday in Pon–Sub) tuple, emit two markers:
 * one at the first session date inside the module window, one at the last.
 * Holiday-filtered, so a holiday on the boundary date naturally shifts the
 * marker to the next/previous real session.
 *
 * Markers always cover all 6 weekdays regardless of where ScheduledGroups
 * currently exist — the calendar is a projection of the schedule, not of
 * group attendance. Dedupes across courses that share the same
 * (date, kind, position, label) so SLR 1-4 collapse to one chip per cell.
 */
export function computeModuleMarkers(input: {
  courses: ReadonlyArray<ModuleMarkerInputCourse>
  holidayDates: ReadonlySet<string>
}): ModuleMarker[] {
  type Group = {
    date: string
    kind: 'start' | 'end'
    moduleIndex: number
    moduleTitle: string
    weekdayName: string
    courses: Set<string>
  }
  const grouped = new Map<string, Group>()

  for (const course of input.courses) {
    for (const w of ACTIVE_WEEKDAYS) {
      // Modules arrive sorted by sortOrder ASC — position in the array is the
      // 1-based ordinal regardless of whether the underlying sortOrder field
      // starts at 0 or 1 (the seed uses 1, 2, 3, 4; older data may use 0).
      for (let position = 0; position < course.modules.length; position++) {
        const m = course.modules[position]
        if (!m.startDate || !m.endDate) continue
        const sessions = computeExpectedSessions({
          dayOfWeek: w,
          moduleWindows: [{ startDate: m.startDate, endDate: m.endDate }],
          holidayDates: input.holidayDates,
        })
        if (sessions.length === 0) continue
        const firstKey = toDateKey(sessions[0])
        const lastKey = toDateKey(sessions[sessions.length - 1])
        const moduleIndex = position + 1

        for (const [date, kind] of [
          [firstKey, 'start' as const],
          [lastKey, 'end' as const],
        ] as const) {
          const key = `${date}|${kind}|${moduleIndex}|${m.title}`
          let g = grouped.get(key)
          if (!g) {
            g = {
              date,
              kind,
              moduleIndex,
              moduleTitle: m.title,
              weekdayName: w,
              courses: new Set(),
            }
            grouped.set(key, g)
          }
          g.courses.add(course.courseLabel)
        }
      }
    }
  }

  const out: ModuleMarker[] = []
  for (const g of grouped.values()) {
    const kindLabel = g.kind === 'start' ? 'početak' : 'kraj'
    const courseList = [...g.courses].sort().join(', ')
    const wday = SHORT_WEEKDAY[g.weekdayName] ?? g.weekdayName
    out.push({
      date: g.date,
      kind: g.kind,
      moduleIndex: g.moduleIndex,
      label: g.moduleTitle,
      tooltip: `${courseList} · ${g.moduleTitle} — ${kindLabel} (${wday})`,
    })
  }
  // Stable order: date ASC, then kind (start before end).
  out.sort((a, b) =>
    a.date === b.date
      ? a.kind === b.kind
        ? 0
        : a.kind === 'start'
          ? -1
          : 1
      : a.date < b.date
        ? -1
        : 1,
  )
  return out
}
