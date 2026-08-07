/**
 * The one program filter on `/admin/grupe`. It drives both the weekly grid and
 * the group table below it, so the rule that decides what is on screen — and
 * the colour each program is drawn in — lives here rather than in either view.
 */
import type { ProgramKind } from '@prisma/client'
import { isCompetition, isRadionica, isStandard } from '@/lib/program-kind'

/**
 * A level key narrows to one program; `standard`/`competition`/`radionice`
 * group a whole kind — `standard` is the "cijela SLR ljestvica" shortcut
 * (Uvod + SLR 1–4), which no level key can express on its own.
 */
export type GroupFilterKey =
  | 'all'
  | 'standard'
  | 'competition'
  | 'radionice'
  | 'UVOD'
  | 'SLR_1'
  | 'SLR_2'
  | 'SLR_3'
  | 'SLR_4'

export const LEVEL_FILTERS: { key: GroupFilterKey; label: string }[] = [
  { key: 'UVOD', label: 'Uvod' },
  { key: 'SLR_1', label: 'SLR 1' },
  { key: 'SLR_2', label: 'SLR 2' },
  { key: 'SLR_3', label: 'SLR 3' },
  { key: 'SLR_4', label: 'SLR 4' },
]

export const FILTER_LABEL: Record<GroupFilterKey, string> = {
  all: 'Sve grupe',
  standard: 'Svi SLR',
  competition: 'Natjecateljski',
  radionice: 'Radionice',
  UVOD: 'Uvod',
  SLR_1: 'SLR 1',
  SLR_2: 'SLR 2',
  SLR_3: 'SLR 3',
  SLR_4: 'SLR 4',
}

export type ProgramRef = { level: string | null; kind: ProgramKind }

export type Palette = {
  /** Block on the weekly grid. */
  bg: string
  border: string
  text: string
  /** Filter chip: colour swatch, and the filled state once the chip is on. */
  dot: string
  active: string
  ring: string
}

const NEUTRAL: Palette = {
  bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700',
  dot: 'bg-gray-400', active: 'border-gray-800 bg-gray-800 text-white', ring: 'focus-visible:ring-gray-400',
}

const PALETTES: Record<string, Palette> = {
  // Indigo, not emerald: on the weekly grid the fill is the only thing telling
  // two programs apart, and emerald against SLR 2's green measured ΔE 0.015
  // (fill) / 0.038 (border) in OKLab — under the just-noticeable threshold, so
  // the two read as one program. Indigo's nearest neighbour is SLR 4's purple at
  // 0.026 / 0.077. Blue was the other candidate and is marginally better against
  // purple, but its border lands 0.045 from radionice sky — back at the
  // emerald/green failure — so it only moves the collision onto the chip row.
  UVOD: {
    bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-800',
    dot: 'bg-indigo-500', active: 'border-indigo-500 bg-indigo-500 text-white', ring: 'focus-visible:ring-indigo-400',
  },
  SLR_1: {
    bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-800',
    dot: 'bg-cyan-500', active: 'border-cyan-500 bg-cyan-500 text-white', ring: 'focus-visible:ring-cyan-400',
  },
  SLR_2: {
    bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800',
    dot: 'bg-green-500', active: 'border-green-500 bg-green-500 text-white', ring: 'focus-visible:ring-green-400',
  },
  SLR_3: {
    bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-800',
    dot: 'bg-amber-500', active: 'border-amber-500 bg-amber-500 text-white', ring: 'focus-visible:ring-amber-400',
  },
  SLR_4: {
    bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800',
    dot: 'bg-purple-500', active: 'border-purple-500 bg-purple-500 text-white', ring: 'focus-visible:ring-purple-400',
  },
  // The competitive track and radionice carry no CourseLevel, so they are keyed
  // by kind — both used to fall through to neutral grey.
  competition: {
    bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800',
    dot: 'bg-rose-500', active: 'border-rose-500 bg-rose-500 text-white', ring: 'focus-visible:ring-rose-400',
  },
  radionice: {
    bg: 'bg-sky-100', border: 'border-sky-300', text: 'text-sky-800',
    dot: 'bg-sky-500', active: 'border-sky-500 bg-sky-500 text-white', ring: 'focus-visible:ring-sky-400',
  },
  // Chip-only: the whole SLR ladder at once. Its swatch blends the five level
  // colours so the chip reads as "all of the above" rather than a sixth program.
  standard: {
    ...NEUTRAL,
    dot: 'bg-gradient-to-br from-indigo-500 via-green-500 to-purple-500',
  },
}

/** Colour a group is drawn in — by level, falling back to its kind. */
export function paletteFor(course: ProgramRef): Palette {
  if (isCompetition(course.kind)) return PALETTES.competition
  if (isRadionica(course.kind)) return PALETTES.radionice
  return PALETTES[course.level ?? ''] ?? NEUTRAL
}

export function filterPalette(key: GroupFilterKey): Palette {
  return PALETTES[key] ?? NEUTRAL
}

export function matchesGroupFilter(g: { course: ProgramRef }, filter: GroupFilterKey): boolean {
  switch (filter) {
    case 'all': return true
    case 'standard': return isStandard(g.course.kind)
    case 'competition': return isCompetition(g.course.kind)
    case 'radionice': return isRadionica(g.course.kind)
    default: return isStandard(g.course.kind) && g.course.level === filter
  }
}

/** True when the filter picks exactly one program, so naming it per row is noise. */
export function isSingleProgramFilter(key: GroupFilterKey): boolean {
  return key === 'competition' || LEVEL_FILTERS.some((f) => f.key === key)
}

/**
 * `/admin/programi` links here with the program's own id (and `__radionice__`
 * for the shared workshop view) — those links predate this filter and must keep
 * landing on the matching selection.
 */
export function resolveGroupFilter(
  tab: string | undefined,
  courses: { id: string; level: string | null; kind: ProgramKind }[],
): GroupFilterKey {
  if (!tab) return 'all'
  if (tab === '__radionice__') return 'radionice'

  const course = courses.find((c) => c.id === tab)
  if (!course) return 'all'
  if (isRadionica(course.kind)) return 'radionice'
  if (isCompetition(course.kind)) return 'competition'
  return LEVEL_FILTERS.some((f) => f.key === course.level)
    ? (course.level as GroupFilterKey)
    : 'all'
}
