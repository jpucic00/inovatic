/**
 * Predicates over `Course.kind` — the single discriminator every program-shaped
 * branch in the app switches on.
 *
 * These exist so a call site reads as the rule it is applying ("does this
 * program have dated modules?") rather than as an identity check against an
 * enum value. When a fourth kind ever appears, the rules change here and every
 * caller inherits it; a bare `kind === 'STANDARD'` scattered across 40 files
 * would not.
 */
import type { ProgramKind } from '@prisma/client'

/** One-off workshop: no modules, a closed date range, a single payment. */
export function isRadionica(kind: ProgramKind): boolean {
  return kind === 'RADIONICA'
}

/** Natjecateljski program: undated natjecanja, season-long, monthly fee. */
export function isCompetition(kind: ProgramKind): boolean {
  return kind === 'COMPETITION'
}

/** The SLR ladder — Uvod + SLR 1–4, the year-long core programs. */
export function isStandard(kind: ProgramKind): boolean {
  return kind === 'STANDARD'
}

/**
 * Planned as four dated modules (ModuleSchedule) — the school-year planner's
 * domain, and the only kind whose students are paced through one module at a
 * time. COMPETITION has modules but no dates, so it is deliberately excluded.
 */
export function hasDatedModules(kind: ProgramKind): boolean {
  return kind === 'STANDARD'
}

/** Has CourseModule rows at all — true for everything except radionice. */
export function hasModules(kind: ProgramKind): boolean {
  return kind !== 'RADIONICA'
}

/**
 * Students see every module at once instead of only the one their group is
 * currently working through. True for COMPETITION: which natjecanje a group
 * attends is recorded in its name, not in the data, so the app cannot (and
 * should not) narrow the materials for them.
 */
export function showsAllModules(kind: ProgramKind): boolean {
  return kind === 'COMPETITION'
}

/** Paid month by month across the season, rather than per module or per year. */
export function isMonthlyBilled(kind: ProgramKind): boolean {
  return kind === 'COMPETITION'
}

/**
 * Report cards exist for this kind. Radionice are never graded (a two-day
 * workshop has nothing to assess); competitors are, exactly like SLR students.
 */
export function isGradable(kind: ProgramKind): boolean {
  return kind !== 'RADIONICA'
}

/**
 * Title/description/age/price are association-authored and editable in the
 * admin. Standard SLR copy is shared catalog content mirrored on the public
 * site from `courses-data.ts`, so it is deliberately not editable here.
 */
export function isEditableCourse(kind: ProgramKind): boolean {
  return kind !== 'STANDARD'
}
