import type { ProgramKind } from '@prisma/client'
import { hasDatedModules, isCompetition, isRadionica } from '@/lib/program-kind'
import { COMPETITION_MAX_SESSION, PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'

/**
 * Where a lesson may sit, and which sats it may hold (Materijali v2). Pure, so
 * the lesson actions and their tests share one definition.
 *
 *   - A radionica has no modules: its lessons sit directly under the program
 *     and are undated (its termini differ per ciklus, so "the 3rd sat" means
 *     nothing across groups).
 *   - A natjecanje lesson belongs to a module and may hold sats 1..52: the
 *     season meets once a week, so sat N is the group's Nth weekly termin of
 *     the season (owner, 2026-10-26). No probni sat.
 *   - A standard lesson belongs to a module and may hold sats 1–7; sat 0 (the
 *     probni sat) exists only before the program's FIRST module.
 *
 * Returns the Croatian error to show, or null when the placement is valid.
 */
export function lessonPlacementError(input: {
  kind: ProgramKind
  moduleId: string | null
  /** Whether `moduleId` is the program's first module by sortOrder. */
  isFirstModule: boolean
  sessionNumbers: readonly number[]
}): string | null {
  if (isRadionica(input.kind)) {
    if (input.moduleId !== null) return 'Radionica nema module — lekcija ide izravno pod program.'
  } else if (input.moduleId === null) {
    return 'Odaberite modul lekcije.'
  }

  if (input.sessionNumbers.length === 0) return null
  if (isCompetition(input.kind)) {
    if (input.sessionNumbers.some((n) => n < 1 || n > COMPETITION_MAX_SESSION)) {
      return `Sat natjecanja mora biti između 1 i ${COMPETITION_MAX_SESSION}.`
    }
    return null
  }
  if (!hasDatedModules(input.kind)) {
    return 'Lekcije ovog programa nemaju sate — vidljive su cijelo vrijeme.'
  }
  if (input.sessionNumbers.some((n) => n > 7)) return 'Modul ima 7 sati.'
  if (input.sessionNumbers.includes(PROBNI_SAT_SESSION) && !input.isFirstModule) {
    return 'Probni sat postoji samo prije prvog modula.'
  }
  return null
}
