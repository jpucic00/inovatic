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
import { getGroupModuleArc } from '@/lib/group-module-arc'
import {
  addDays,
  computeExpectedSessions,
  fromDateKey,
  nthWeekdaySession,
  toDateKey,
  utcMidnight,
} from '@/lib/session-dates'

const SESSIONS_PER_MODULE = 7
export const MODULE_COUNT = 4

const DAY_MS = 86_400_000

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
      const seventh = nthWeekdaySession(
        moduleStart,
        w,
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

type WorkshopDayEntry = { titles: Set<string> }

/**
 * Walk every day in [dateStart, dateEnd] (inclusive) for one radionica group
 * and record its title under each non-Sunday day. Mutates `byDate` in place so
 * the caller can fold many groups into one dedupe map.
 */
function addWorkshopGroupDays(
  byDate: Map<string, WorkshopDayEntry>,
  dateStart: string,
  dateEnd: string,
  courseTitle: string,
): void {
  let cur = fromDateKey(dateStart).getTime()
  const end = fromDateKey(dateEnd).getTime()
  if (end < cur) return
  while (cur <= end) {
    const day = new Date(cur)
    if (day.getUTCDay() !== 0) {
      const key = toDateKey(day)
      let entry = byDate.get(key)
      if (!entry) {
        entry = { titles: new Set() }
        byDate.set(key, entry)
      }
      entry.titles.add(courseTitle)
    }
    cur += DAY_MS
  }
}

/**
 * Enumerate every day in [dateStart, dateEnd] (inclusive, YYYY-MM-DD keys) for
 * each radionica group + emit one label per (date, course.title). Skips Sundays
 * because the association never schedules workshops on Nedjelja. Deduped per
 * day so two groups of the same workshop on the same day collapse to one
 * label. Holidays are NOT skipped here — the admin needs to see when a workshop
 * conflicts with a holiday. Attendance computation handles the holiday skip
 * separately.
 */
export function computeWorkshopLabels(input: {
  radionicaGroups: ReadonlyArray<{
    dateStart: string | null
    dateEnd: string | null
    courseTitle: string
  }>
}): WorkshopLabel[] {
  const byDate = new Map<string, WorkshopDayEntry>()

  for (const g of input.radionicaGroups) {
    if (!g.dateStart || !g.dateEnd) continue
    addWorkshopGroupDays(byDate, g.dateStart, g.dateEnd, g.courseTitle)
  }

  const out: WorkshopLabel[] = []
  for (const [date, entry] of byDate) {
    for (const title of [...entry.titles].sort((a, b) => a.localeCompare(b))) {
      out.push({ date, title })
    }
  }
  out.sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title)
    return a.date < b.date ? -1 : 1
  })
  return out
}

type MarkerGroup = {
  date: string
  kind: 'start' | 'end'
  moduleIndex: number
  moduleTitle: string
  weekdayName: string
  courses: Set<string>
}

/**
 * Fold one weekday's race-ahead arc into the dedupe map: every module emits a
 * `start` marker at its first session and an `end` marker at its last, keyed by
 * (date, kind, moduleIndex, title) so identical markers from sibling courses
 * collapse to a single chip that accumulates each contributing course label.
 */
function accumulateArcMarkers(
  grouped: Map<string, MarkerGroup>,
  arc: ReturnType<typeof getGroupModuleArc>,
  weekdayName: string,
  courseLabel: string,
): void {
  for (const entry of arc) {
    const firstKey = toDateKey(entry.firstSession)
    const lastKey = toDateKey(entry.lastSession)

    for (const [date, kind] of [
      [firstKey, 'start' as const],
      [lastKey, 'end' as const],
    ] as const) {
      const key = `${date}|${kind}|${entry.moduleIndex}|${entry.moduleTitle}`
      let g = grouped.get(key)
      if (!g) {
        g = {
          date,
          kind,
          moduleIndex: entry.moduleIndex,
          moduleTitle: entry.moduleTitle,
          weekdayName,
          courses: new Set(),
        }
        grouped.set(key, g)
      }
      g.courses.add(courseLabel)
    }
  }
}

/**
 * For every (course × module × weekday in Pon–Sub) tuple, emit two markers:
 * one at the weekday's *first* session of the module, one at its *7th*. Uses
 * `getGroupModuleArc` so the markers carry race-ahead semantics — a fast
 * weekday's M1-end lands on its own 7th session, not on the slowest
 * weekday's. The slowest weekday's marker still anchors on
 * `ModuleSchedule.endDate` because the planner already wrote that as its 7th.
 *
 * Markers always cover all 6 weekdays regardless of where ScheduledGroups
 * currently exist — the calendar is a projection of the schedule, not of
 * group attendance. Dedupes across courses that share the same
 * (date, kind, position, label) so SLR 1-4 collapse to one chip per cell.
 *
 * Note: when a module is missing its dates, the arc stops there (race-ahead
 * cursor has nowhere to land) so later-module markers are suppressed too.
 * In practice the planner sets all 4 dates atomically, so partial-date input
 * only happens during ad-hoc admin edits.
 */
export function computeModuleMarkers(input: {
  courses: ReadonlyArray<ModuleMarkerInputCourse>
  holidayDates: ReadonlySet<string>
}): ModuleMarker[] {
  const grouped = new Map<string, MarkerGroup>()

  for (const course of input.courses) {
    // The arc primitive expects ArcModuleInput shape. We don't need module/
    // schedule IDs for marker rendering, so pass empty-string placeholders.
    const arcModules = course.modules.map((m) => ({
      id: '',
      title: m.title,
      sortOrder: m.sortOrder,
      schedule:
        m.startDate && m.endDate
          ? { id: '', startDate: m.startDate, endDate: m.endDate }
          : null,
    }))
    for (const w of ACTIVE_WEEKDAYS) {
      const arc = getGroupModuleArc({
        dayOfWeek: w,
        modules: arcModules,
        holidayDates: input.holidayDates,
      })
      accumulateArcMarkers(grouped, arc, w, course.courseLabel)
    }
  }

  const out: ModuleMarker[] = []
  for (const g of grouped.values()) {
    const kindLabel = g.kind === 'start' ? 'početak' : 'kraj'
    const courseList = [...g.courses].sort((a, b) => a.localeCompare(b)).join(', ')
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
  out.sort((a, b) => {
    if (a.date === b.date) {
      if (a.kind === b.kind) return 0
      return a.kind === 'start' ? -1 : 1
    }
    return a.date < b.date ? -1 : 1
  })
  return out
}
