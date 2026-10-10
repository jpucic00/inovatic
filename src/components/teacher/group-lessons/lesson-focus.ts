import type { StaffLessonModule } from '@/actions/teacher/materials'

/** A module's key in the open-state sets; a radionica's one list has no module. */
export const moduleKey = (m: Pick<StaffLessonModule, 'moduleId'>): string => m.moduleId ?? 'program'

type LessonFocus = {
  /** The lesson the group is on now — labelled "Trenutna lekcija". */
  currentLessonId: string | null
  /** The next lesson to start — labelled "Sljedeća", what the teacher prepares. */
  nextLessonId: string | null
  openModuleKeys: ReadonlySet<string>
  openLessonIds: ReadonlySet<string>
}

/**
 * What the staff lesson view marks and opens on arrival.
 *
 * The server places every module's lessons on its own arc, so EACH module
 * carries an `isCurrent` and an `isNext`: a finished module's last lesson is
 * "current" there, a future module's first lesson is "next" there. Read
 * module by module that would mark four current lessons, so the marks are
 * resolved across the whole program here:
 *
 * - current = the active module's current lesson (a radionica's single list
 *   counts as active). It is labelled only when dated — an undated lesson is
 *   current merely because it comes first, the same rule as the portal.
 * - next = the earliest-dated `isNext` of ANY module, because when the group
 *   is on a module's last lesson, what comes next is the first lesson of the
 *   following module.
 *
 * Only the modules holding one of those two are open, which keeps a page of
 * four modules × seven lessons down to what the teacher is preparing. A
 * program with no dates at all (natjecateljski: every natjecanje runs at once)
 * has nothing to focus on, so every module is open with its lessons closed.
 *
 * Pure function of props, so server and client render the same first state.
 */
export function resolveLessonFocus(modules: readonly StaffLessonModule[]): LessonFocus {
  const single = modules.length === 1
  const focusModule = modules.find((m) => m.isActive) ?? (single ? modules[0] : undefined)
  const current = focusModule?.lessons.find((l) => l.isCurrent) ?? null

  let next: { id: string; firstDate: Date } | null = null
  for (const m of modules) {
    for (const l of m.lessons) {
      if (!l.isNext || l.firstDate === null) continue
      if (next === null || l.firstDate.getTime() < next.firstDate.getTime()) {
        next = { id: l.id, firstDate: l.firstDate }
      }
    }
  }

  const focusIds = [current?.id, next?.id].filter((id): id is string => id !== undefined)
  const openModuleKeys = new Set<string>()
  for (const m of modules) {
    if (m.lessons.some((l) => focusIds.includes(l.id))) openModuleKeys.add(moduleKey(m))
  }
  // An undated current lesson is still opened (it is the one to start with),
  // just not labelled.
  const openLessonIds = new Set(focusIds)

  const anyDated = modules.some((m) => m.lessons.some((l) => l.firstDate !== null))
  if (!anyDated && openModuleKeys.size === 0) {
    for (const m of modules) openModuleKeys.add(moduleKey(m))
  }
  if (single && modules[0]) openModuleKeys.add(moduleKey(modules[0]))

  return {
    currentLessonId: current && current.firstDate !== null ? current.id : null,
    nextLessonId: next?.id ?? null,
    openModuleKeys,
    openLessonIds,
  }
}
