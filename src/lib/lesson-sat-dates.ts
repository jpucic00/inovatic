import { getGroupModuleArc } from '@/lib/group-module-arc'
import { computeTrialSession } from '@/lib/session-dates'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import { PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'

export type SatDateRange = {
  sessionNumber: number
  /** Earliest weekday's date for this sat. */
  from: Date
  /** Latest weekday's date for this sat — equal to `from` when all weekdays agree. */
  to: Date
}

type ArcModule = {
  id: string
  title: string
  sortOrder: number
  schedule: { id: string; startDate: Date | null; endDate: Date | null } | null
}

/**
 * Sample dates for the lesson editor's sat picker: for every module, when its
 * Nth sat falls across all six weekdays in one city and year.
 *
 * A lesson is bound to the sat NUMBER, never a date — a Monday and a Thursday
 * group reach "3. sat" on different days, and a holiday shifts one weekday but
 * not another. A range ("20.–25.10.") is the honest way to show that; it is a
 * hint for the admin, never stored. Sat 0 is the probni sat of the first module,
 * from the city's trial week.
 */
export function moduleSatDateRanges(input: {
  modules: readonly ArcModule[]
  holidayDates: ReadonlySet<string>
  trialWeek: { startDate: Date; endDate: Date } | null
}): Map<string, SatDateRange[]> {
  const ranges = new Map<string, Map<number, SatDateRange>>()
  const add = (moduleId: string, sessionNumber: number, date: Date) => {
    let perModule = ranges.get(moduleId)
    if (!perModule) {
      perModule = new Map()
      ranges.set(moduleId, perModule)
    }
    const current = perModule.get(sessionNumber)
    if (!current) {
      perModule.set(sessionNumber, { sessionNumber, from: date, to: date })
      return
    }
    if (date < current.from) current.from = date
    if (date > current.to) current.to = date
  }

  const firstModule = [...input.modules].sort((a, b) => a.sortOrder - b.sortOrder)[0]

  for (const weekday of ACTIVE_WEEKDAYS) {
    const arc = getGroupModuleArc({
      dayOfWeek: weekday,
      modules: input.modules,
      holidayDates: input.holidayDates,
    })
    for (const entry of arc) {
      entry.sessionDates.forEach((date, index) => add(entry.moduleId, index + 1, date))
    }
    if (firstModule && input.trialWeek) {
      const trial = computeTrialSession({
        dayOfWeek: weekday,
        startDate: input.trialWeek.startDate,
        endDate: input.trialWeek.endDate,
        holidayDates: input.holidayDates,
      })
      if (trial) add(firstModule.id, PROBNI_SAT_SESSION, trial)
    }
  }

  const result = new Map<string, SatDateRange[]>()
  for (const [moduleId, perModule] of ranges) {
    result.set(
      moduleId,
      [...perModule.values()].sort((a, b) => a.sessionNumber - b.sessionNumber),
    )
  }
  return result
}
