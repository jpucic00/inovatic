import type { City, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { computeTrialSession } from '@/lib/session-dates'
import { hasDatedModules } from '@/lib/program-kind'

/** The group fields a trial date is derived from. */
type TrialGroup = {
  dayOfWeek: string | null
  schoolYear: string
  city: City
  course: { kind: ProgramKind }
}

/**
 * The probni sat date for one group, or null.
 *
 * Keyed on the GROUP'S OWN `schoolYear`, never `computeSchoolYear()`. Upisi for
 * next year open during the summer while the clock still names the year that is
 * ending, so resolving "today's" trial week would silently use the wrong year's
 * setup — the same trap `getCourseGradeRules` documents.
 *
 * STANDARD programs only, via `hasDatedModules`: a radionica IS a one-off trial
 * of its own and the competitive program is invitation-only, so neither has a
 * trial to offer.
 *
 * Returns null when the year has no trial week, the program is out of scope, or
 * a holiday fell on the group's day that week.
 */
export async function resolveTrialDateForGroup(group: TrialGroup): Promise<Date | null> {
  if (!hasDatedModules(group.course.kind)) return null

  const week = await db.trialWeek.findUnique({
    where: { schoolYear_city: { schoolYear: group.schoolYear, city: group.city } },
    select: { startDate: true, endDate: true },
  })
  if (!week) return null

  const holidayDates = await loadHolidayDateKeys(group.schoolYear, group.city)
  return computeTrialSession({
    dayOfWeek: group.dayOfWeek,
    startDate: week.startDate,
    endDate: week.endDate,
    holidayDates,
  })
}
