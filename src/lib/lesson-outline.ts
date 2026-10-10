import { LESSON_SESSION_NUMBERS, PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'

/**
 * What a module's card on the program page lists, in order: its lessons, and —
 * for a DATED module — every sat no lesson holds yet, in its own position, so a
 * gap in the curriculum reads as a gap rather than disappearing.
 *
 * A lesson is listed once, at its FIRST sat; the further sats it holds are
 * named by its label ("2.–3. sat"), not repeated as rows. Undated lessons (a
 * radionica, a natjecanje, or a standard lesson whose sats are not picked yet)
 * follow in the order they were given. Pure and client-safe.
 */
type LessonOutlineEntry<T> =
  | { kind: 'lesson'; lesson: T }
  | { kind: 'free'; sessionNumber: number }

export function buildLessonOutline<T extends { sessionNumbers: readonly number[] }>(input: {
  /** Already in display order (`placeLessons`). */
  lessons: readonly T[]
  dated: boolean
  /** The program's first module — the only one with a probni sat slot. */
  isFirstModule: boolean
}): LessonOutlineEntry<T>[] {
  if (!input.dated) return input.lessons.map((lesson) => ({ kind: 'lesson', lesson }))

  const slots = [
    ...(input.isFirstModule ? [PROBNI_SAT_SESSION] : []),
    ...LESSON_SESSION_NUMBERS,
  ]
  const firstSat = (l: T) => (l.sessionNumbers.length > 0 ? Math.min(...l.sessionNumbers) : null)
  const held = new Set(input.lessons.flatMap((l) => [...l.sessionNumbers]))

  const entries: LessonOutlineEntry<T>[] = []
  for (const slot of slots) {
    const starting = input.lessons.filter((l) => firstSat(l) === slot)
    for (const lesson of starting) entries.push({ kind: 'lesson', lesson })
    if (!held.has(slot)) entries.push({ kind: 'free', sessionNumber: slot })
  }
  // Undated lessons, and any holding only sats outside this module's slots
  // (a probni sat left on a module that is no longer first) — never dropped.
  for (const lesson of input.lessons) {
    const first = firstSat(lesson)
    if (first === null || !slots.includes(first)) entries.push({ kind: 'lesson', lesson })
  }
  return entries
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A sat's sample date span, "20.10." or "20.–25.10." or "28.10.–03.11.".
 *
 * Read with UTC getters on purpose: the dates are `@db.Date`-style UTC
 * midnights, and this runs on both the server and the client — a local getter
 * would name the previous day on any machine west of UTC and break hydration.
 */
export function formatSatDateRange(from: Date, to: Date): string {
  const fd = from.getUTCDate()
  const fm = from.getUTCMonth() + 1
  const td = to.getUTCDate()
  const tm = to.getUTCMonth() + 1
  if (from.getTime() === to.getTime()) return `${pad(fd)}.${pad(fm)}.`
  if (fm === tm && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${pad(fd)}.–${pad(td)}.${pad(tm)}.`
  }
  return `${pad(fd)}.${pad(fm)}.–${pad(td)}.${pad(tm)}.`
}

/** The sample span of one sat, or null when the year has no plan for it. */
export function satDateLabel(
  satDates: readonly { sessionNumber: number; from: Date; to: Date }[],
  sessionNumber: number,
): string | null {
  const range = satDates.find((r) => r.sessionNumber === sessionNumber)
  return range ? formatSatDateRange(new Date(range.from), new Date(range.to)) : null
}
