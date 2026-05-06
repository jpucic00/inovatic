type ModuleWithSchedule = {
  id: string
  title: string
  sortOrder: number
  schedules: {
    schoolYear: string
    startDate: Date | null
    endDate: Date | null
  }[]
}

/**
 * Picks the module that "currently applies" for a given school year.
 *
 * Priority:
 *   1. A module whose ModuleSchedule window covers today.
 *   2. The soonest-upcoming module whose schedule starts after today.
 *   3. The most-recently-ended module if all modules are in the past.
 *   4. The first module by sortOrder as a last resort (covers the case where
 *      no ModuleSchedule rows exist yet for the school year).
 *
 * Returns null if the course has no modules at all (radionice / custom courses).
 */
export function getCurrentActiveModule(
  modules: ModuleWithSchedule[],
  schoolYear: string,
  now: Date = new Date()
): ModuleWithSchedule | null {
  if (modules.length === 0) return null

  const today = startOfDay(now)

  const enriched = modules.map((m) => {
    const schedule = m.schedules.find((s) => s.schoolYear === schoolYear)
    return {
      module: m,
      start: schedule?.startDate ?? null,
      end: schedule?.endDate ?? null,
    }
  })

  const current = enriched.find(
    (e) => e.start && e.end && e.start <= today && today <= e.end
  )
  if (current) return current.module

  const upcoming = enriched
    .filter((e) => e.start && e.start > today)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime())
  if (upcoming.length > 0) return upcoming[0].module

  const past = enriched
    .filter((e) => e.end && e.end < today)
    .sort((a, b) => b.end!.getTime() - a.end!.getTime())
  if (past.length > 0) return past[0].module

  return [...modules].sort((a, b) => a.sortOrder - b.sortOrder)[0]
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}
