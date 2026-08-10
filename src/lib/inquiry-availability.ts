import type { ActiveProgram } from '@/actions/public/programs'
import {
  ELEMENTARY_GRADE_VALUES,
  type ElementaryGrade,
  type Grade,
} from '@/lib/inquiry-status'
import { hasDatedModules } from '@/lib/program-kind'

// Child grade → standard program level. Predškolci have their own program
// (UVOD, WeDo 2.0) since 2026-07-29 — before that they shared SLR 1 — and from
// 1. razred it is two grades per level up to SLR 4. Used to narrow the open
// programs to the ones a given child's grade can actually enrol into.
//
// The srednja škola grades map to null: no SLR level is right for them. They
// exist only for the competitive program, which is reached through its own
// signup link and bypasses this narrowing entirely.
//
// This is the DEFAULT ladder, not the last word: a `CourseGradeRule` row for a
// (course, school year, city) replaces it for that one program — see
// `programAcceptsGrade`.
const GRADE_TO_LEVEL: Record<Grade, string | null> = {
  predskolci: 'UVOD',
  '1': 'SLR_1',
  '2': 'SLR_1',
  '3': 'SLR_2',
  '4': 'SLR_2',
  '5': 'SLR_3',
  '6': 'SLR_3',
  '7': 'SLR_4',
  '8': 'SLR_4',
  ss1: null,
  ss2: null,
  ss3: null,
  ss4: null,
}

/**
 * Saved per-program razred overrides for one city + school year, keyed by
 * `Course.id`.
 *
 * A program ABSENT from the map falls back to the default ladder above. A
 * program present with an EMPTY list is offered to nobody — that is a real
 * answer an admin can save, so the two must never be conflated.
 */
export type CourseGradeRules = Readonly<Record<string, readonly Grade[]>>

/**
 * The razredi a standard program is offered to by default — the inverse of
 * `GRADE_TO_LEVEL`, and what the admin editor pre-fills with. Only osnovna
 * škola: the srednjoškolski grades belong to the competitive program, which is
 * never narrowed by razred.
 */
export function defaultGradesForLevel(level: string | null): ElementaryGrade[] {
  if (!level) return []
  return ELEMENTARY_GRADE_VALUES.filter((g) => GRADE_TO_LEVEL[g] === level)
}

/**
 * The razredi a program is actually offered to: its saved rule when it has one,
 * else the default ladder. Also normalizes order and drops anything that is not
 * a current razred value, so a stored list survives a catalog change.
 */
export function effectiveGrades(
  level: string | null,
  saved: readonly string[] | null | undefined,
): ElementaryGrade[] {
  if (saved) return ELEMENTARY_GRADE_VALUES.filter((g) => saved.includes(g))
  return defaultGradesForLevel(level)
}

/**
 * Razredi that no standard program is offered to. Configuring rules per program
 * makes it possible to strand one — a razred pointing nowhere silently shows
 * "Nema otvorenih termina" on `/prijava`, so the admin list warns about it.
 */
export function uncoveredGrades(
  offered: readonly (readonly ElementaryGrade[])[],
): ElementaryGrade[] {
  const covered = new Set(offered.flat())
  return ELEMENTARY_GRADE_VALUES.filter((g) => !covered.has(g))
}

/**
 * Whether this program is offered to this razred — its saved rule when it has
 * one, else the default ladder.
 */
function programAcceptsGrade(
  program: ActiveProgram,
  grade: Grade,
  rules?: CourseGradeRules,
): boolean {
  const override = rules?.[program.id]
  // An empty list is a saved answer ("offered to nobody") and is truthy — do
  // NOT rewrite this as `override?.length ? … : default`, which would silently
  // hand such a program back to the default ladder.
  if (override) return override.includes(grade)
  const level = GRADE_TO_LEVEL[grade]
  // A srednja škola grade matches no SLR level — nothing in the public
  // catalog is right for them.
  return level !== null && program.level === level
}

/**
 * The open programs relevant to the current Step-3 selection — the exact set
 * whose groups render in the "Željeni termin" dropdown.
 *
 * - Radionica flow (`preselectedCourseId` set): only that one course.
 * - Standard flow: radionice are excluded (they enrol via their own URL); once
 *   a grade is chosen, narrow to the programs offered to that grade. With no
 *   grade yet, every standard program qualifies (the dropdown is still disabled
 *   upstream).
 *
 * `rules` are the admin's per-program razred overrides for the selected city.
 * More than one program may answer to a grade — the dropdown renders each under
 * its own optgroup, so a city offering 8. razred both SLR 3 and SLR 4 works.
 */
export function programsForSelection(
  programs: ActiveProgram[],
  grade: Grade | '' | undefined,
  preselectedCourseId?: string,
  rules?: CourseGradeRules,
): ActiveProgram[] {
  if (preselectedCourseId) return programs.filter((p) => p.id === preselectedCourseId)
  return programs.filter((p) => {
    // Radionice enrol through their own /radionice/<slug> page, and the
    // competitive program only through its invitation link — neither belongs in
    // the grade-driven catalog.
    if (!hasDatedModules(p.kind)) return false
    if (!grade) return true
    return programAcceptsGrade(p, grade, rules)
  })
}

/** True when at least one group among these programs still has a free spot. */
export function hasOpenTermin(programs: ActiveProgram[]): boolean {
  return programs.some((p) => p.groups.some((g) => !g.isFull))
}

/**
 * Whether the parent MUST pick a termin for the current selection.
 *
 * Mandatory only once a grade (or a preselected radionica course) is chosen AND
 * that selection still has a bookable, non-full group. When no enrolment window
 * is open, or every matching group is full, it stays optional so a general
 * "leave your details" inquiry can still be sent.
 */
export function isTerminRequired(
  programs: ActiveProgram[],
  grade: Grade | '' | undefined,
  preselectedCourseId?: string,
  rules?: CourseGradeRules,
): boolean {
  const selectionChosen = !!preselectedCourseId || !!grade
  if (!selectionChosen) return false
  return hasOpenTermin(programsForSelection(programs, grade, preselectedCourseId, rules))
}
