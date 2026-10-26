/**
 * Where a module's lessons fall on ONE group's calendar, and which of them is
 * current (Materijali v2, 2026-10-10).
 *
 * A lesson is bound to sat NUMBERS, never dates: sat N of a module is the Nth
 * session on the group's own race-ahead arc (`getGroupModuleArc`), so the same
 * lesson lands on different dates for a Monday and a Thursday group, in Split
 * and in Šibenik, and moves with a holiday — without anybody editing it. Sat 0
 * is the probni sat, which exists only before the first module of a standard
 * program.
 *
 * Pure and client-safe: the caller resolves the arc and the trial date.
 */

/** The probni sat slot — the extra session before module 1's seven. */
export const PROBNI_SAT_SESSION = 0

/** Sats a lesson can hold in a standard module: 1..7 (`SESSIONS_PER_MODULE`). */
export const LESSON_SESSION_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * Upper bound on a natjecanje lesson's sat. A natjecanje runs one sat a week
 * across the whole season (`computeSeasonSessions`), so its sats are numbered
 * 1..N with N depending on the season, the weekday and the holidays; 52 is a
 * whole calendar year of weeks, more than any season can hold. Mirrored by the
 * `LessonSession_number_check` constraint.
 */
export const COMPETITION_MAX_SESSION = 52

/**
 * The sats the lesson editor offers for one module. Standard: probni sat (first
 * module only) + 1..7. Natjecanje: 1..`seasonSessionCount` — the most sats any
 * weekday reaches in the selected season — but never fewer than the sats
 * already held, so a shortened season cannot hide a lesson's own sat. With no
 * season planned yet a default of 30 weeks keeps the picker usable.
 */
export function lessonSessionSlots(input: {
  competition: boolean
  isFirstModule: boolean
  seasonSessionCount: number
  held: readonly number[]
}): number[] {
  if (!input.competition) {
    return [...(input.isFirstModule ? [PROBNI_SAT_SESSION] : []), ...LESSON_SESSION_NUMBERS]
  }
  const count = Math.min(
    COMPETITION_MAX_SESSION,
    Math.max(input.seasonSessionCount > 0 ? input.seasonSessionCount : 30, ...input.held),
  )
  return Array.from({ length: count }, (_, i) => i + 1)
}

type LessonInput = {
  id: string
  sortOrder: number
  createdAt: Date
  /** Any order; empty = an undated lesson (radionica, natjecanje, sats not picked yet). */
  sessionNumbers: readonly number[]
}

type PlacedLesson<T extends LessonInput> = T & {
  /** Sorted ascending. */
  sessionNumbers: number[]
  /** First of the lesson's sats on this group's calendar; null when it has none placed. */
  firstDate: Date | null
}

type LessonPlacement<T extends LessonInput> = {
  /** Display order: by first sat (probni sat first), undated lessons after, by sortOrder. */
  lessons: PlacedLesson<T>[]
  currentLessonId: string | null
  /**
   * The module was placed on the calendar: it had session dates AND at least
   * one lesson holds a sat. Only then is "current" a claim about today.
   */
  dated: boolean
}

/**
 * Orders a module's lessons and picks the current one.
 *
 * Dated mode (`sessionDates` given — a standard module on a group with a usable
 * arc): a lesson becomes current on the Zagreb day of its first sat and stays
 * current until the next lesson's first sat. Before any lesson has started
 * nothing is current — the UI decides what to open.
 *
 * Undated mode (`sessionDates` null — radionica, a group whose arc or season
 * cannot be computed — or no lesson of the module holds a sat yet): the first
 * lesson in display order is current, so something is always open by default.
 *
 * `today` must be a UTC-midnight date for the Europe/Zagreb calendar day (the
 * same convention as `@db.Date` columns and the arc's session dates).
 */
export function placeLessons<T extends LessonInput>(input: {
  lessons: readonly T[]
  /** The module's sats on this group's arc: index 0 = 1. sat. */
  sessionDates: readonly Date[] | null
  /** The group's probni sat date — pass only for the program's first module. */
  trialDate: Date | null
  today: Date
}): LessonPlacement<T> {
  const dateOf = (n: number): Date | null => {
    if (input.sessionDates === null) return null
    if (n === PROBNI_SAT_SESSION) return input.trialDate
    return input.sessionDates[n - 1] ?? null
  }

  const placed: PlacedLesson<T>[] = input.lessons.map((lesson) => {
    const sessionNumbers = [...lesson.sessionNumbers].sort((a, b) => a - b)
    const dates = sessionNumbers
      .map(dateOf)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())
    return { ...lesson, sessionNumbers, firstDate: dates[0] ?? null }
  })

  placed.sort(compareLessons)

  if (input.sessionDates === null || !placed.some((l) => l.sessionNumbers.length > 0)) {
    return { lessons: placed, currentLessonId: placed[0]?.id ?? null, dated: false }
  }

  const todayMs = input.today.getTime()
  let current: PlacedLesson<T> | null = null
  for (const lesson of placed) {
    if (lesson.firstDate === null || lesson.firstDate.getTime() > todayMs) continue
    if (current === null || lesson.firstDate.getTime() > (current.firstDate as Date).getTime()) {
      current = lesson
    }
  }
  return { lessons: placed, currentLessonId: current?.id ?? null, dated: true }
}

function compareLessons(
  a: { sessionNumbers: number[]; sortOrder: number; createdAt: Date },
  b: { sessionNumbers: number[]; sortOrder: number; createdAt: Date },
): number {
  const aFirst = a.sessionNumbers[0]
  const bFirst = b.sessionNumbers[0]
  if (aFirst !== undefined && bFirst !== undefined && aFirst !== bFirst) return aFirst - bFirst
  if (aFirst !== undefined && bFirst === undefined) return -1
  if (aFirst === undefined && bFirst !== undefined) return 1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.createdAt.getTime() - b.createdAt.getTime()
}

/** "1. sat", "1.–2. sat", "1., 3. sat", "Probni sat", "Probni sat, 1. sat". */
export function formatLessonSessions(sessionNumbers: readonly number[]): string {
  const sorted = [...sessionNumbers].sort((a, b) => a - b)
  const parts: string[] = []
  if (sorted[0] === PROBNI_SAT_SESSION) parts.push('Probni sat')
  const sats = sorted.filter((n) => n !== PROBNI_SAT_SESSION)
  if (sats.length > 0) {
    const runs: string[] = []
    let start = sats[0]
    let prev = sats[0]
    for (const n of [...sats.slice(1), Number.NaN]) {
      if (n === prev + 1) {
        prev = n
        continue
      }
      runs.push(start === prev ? `${start}.` : `${start}.–${prev}.`)
      start = n
      prev = n
    }
    parts.push(`${runs.join(', ')} sat`)
  }
  return parts.join(', ')
}
