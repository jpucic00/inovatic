/**
 * Pick the module that "currently applies" for a specific group on a given
 * date. Used by the student portal, teacher panels, and gallery scoping
 * actions — anywhere we need to answer "which module is THIS group on right
 * now" for materials and gallery defaults.
 *
 * Per-group, not course-wide: two groups in the same course on different
 * weekdays can return different modules on the same date (race-ahead from
 * `getGroupModuleArc`). Holidays slow down only the weekday they land on.
 */
import type { City } from '@prisma/client'
import {
  getActiveModuleForGroup,
  getGroupModuleArc,
} from '@/lib/group-module-arc'

type ModuleWithSchedule = {
  id: string
  title: string
  sortOrder: number
  schedules: {
    id: string
    schoolYear: string
    city: City
    startDate: Date | null
    endDate: Date | null
  }[]
}

/**
 * Returns the most contextually-relevant module for this group on `now`:
 *   1. inProgressModule (asOfDate inside [firstSession, lastSession]).
 *   2. lastCompletedModule (during off-session weeks between modules, or after graduation).
 *   3. nextEnrollingModule (before the first session — pre-school-year start).
 *   4. modules[0] when none of the above apply (radionice → null; standard with
 *      no schedules yet → first module so UI always has *something* to show).
 *
 * `dayOfWeek` may be null for radionice (custom courses) which have no modules
 * to begin with — function short-circuits to null.
 */
export function getCurrentActiveModuleForGroup(input: {
  dayOfWeek: string | null
  modules: ModuleWithSchedule[]
  schoolYear: string
  /** The group's city — schedules are per-city since the Šibenik expansion. */
  city: City
  holidayDates: ReadonlySet<string>
  now?: Date
}): ModuleWithSchedule | null {
  if (input.modules.length === 0) return null

  const arcInput = input.modules.map((m) => {
    const schedule = m.schedules.find(
      (s) => s.schoolYear === input.schoolYear && s.city === input.city,
    )
    return {
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
      schedule: schedule
        ? {
            id: schedule.id,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
          }
        : null,
    }
  })

  const arc = getGroupModuleArc({
    dayOfWeek: input.dayOfWeek,
    modules: arcInput,
    holidayDates: input.holidayDates,
  })
  const state = getActiveModuleForGroup(arc, input.now ?? new Date())

  const byId = new Map(input.modules.map((m) => [m.id, m]))
  const pick =
    state.inProgressModule ?? state.lastCompletedModule ?? state.nextEnrollingModule
  if (pick) return byId.get(pick.moduleId) ?? null

  // Empty arc (no schedules, or dayOfWeek missing) — fall back to the first
  // module by sortOrder so the UI has *something* to label.
  return [...input.modules].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null
}
