import type { ActiveProgram } from '@/actions/public/programs'
import type { Grade } from '@/lib/inquiry-status'
import { hasDatedModules } from '@/lib/program-kind'

// Child grade → standard SLR level. Preschool + grades 1–2 share SLR 1, then
// two grades per level up to SLR 4. Used to narrow the open programs to the
// ones a given child's grade can actually enrol into.
//
// The srednja škola grades map to null: no SLR level is right for them. They
// exist only for the competitive program, which is reached through its own
// signup link and bypasses this narrowing entirely.
const GRADE_TO_LEVEL: Record<Grade, string | null> = {
  predskolci: 'SLR_1',
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
 * The open programs relevant to the current Step-3 selection — the exact set
 * whose groups render in the "Željeni termin" dropdown.
 *
 * - Radionica flow (`preselectedCourseId` set): only that one course.
 * - Standard flow: radionice are excluded (they enrol via their own URL); once
 *   a grade is chosen, narrow to that grade's SLR level. With no grade yet,
 *   every standard program qualifies (the dropdown is still disabled upstream).
 */
export function programsForSelection(
  programs: ActiveProgram[],
  grade: Grade | '' | undefined,
  preselectedCourseId?: string,
): ActiveProgram[] {
  if (preselectedCourseId) return programs.filter((p) => p.id === preselectedCourseId)
  return programs.filter((p) => {
    // Radionice enrol through their own /radionice/<slug> page, and the
    // competitive program only through its invitation link — neither belongs in
    // the grade-driven catalog.
    if (!hasDatedModules(p.kind)) return false
    if (!grade) return true
    const level = GRADE_TO_LEVEL[grade]
    // A srednja škola grade matches no SLR level — nothing in the public
    // catalog is right for them.
    if (!level) return false
    return p.level === level
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
): boolean {
  const selectionChosen = !!preselectedCourseId || !!grade
  if (!selectionChosen) return false
  return hasOpenTermin(programsForSelection(programs, grade, preselectedCourseId))
}
