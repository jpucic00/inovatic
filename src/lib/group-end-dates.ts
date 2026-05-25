import type { CourseLevel } from '@prisma/client'
import { STANDARD_PROGRAM_SESSION_TARGET } from '@/lib/constants'
import { computeExpectedSessions } from '@/lib/session-dates'

// The 6 weekdays groups can run on. Sunday is excluded — the association
// never schedules workshops on Nedjelja.
export const ACTIVE_WEEKDAYS = [
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
] as const

export type ActiveWeekday = (typeof ACTIVE_WEEKDAYS)[number]

export type ModuleWindowInput = {
  startDate: Date | null
  endDate: Date | null
}

export type CourseWithModules = {
  courseId: string
  courseTitle: string
  level: CourseLevel | null
  moduleWindows: ModuleWindowInput[]
}

export type CourseWeekdayCell = {
  courseId: string
  courseTitle: string
  level: CourseLevel | null
  computedSessions: number
  lastSessionDate: Date | null
  lastModuleEndDate: Date | null
  target: number
  /** True when the computed last session falls after every module's endDate. */
  overflowsWindow: boolean
  /** True when the computed session count is below the target. */
  shortOfTarget: boolean
}

export type WeekdaySummary = {
  weekday: ActiveWeekday
  courses: CourseWeekdayCell[]
}

/**
 * For each (weekday, standard course) pair, compute how many sessions the
 * group would actually run once holidays are removed, and when the last
 * session falls. Powers the per-weekday end-date summary on
 * `/admin/skolska-godina` and (later) the inline indicator on group pages.
 */
export function computeWeekdaySummary(input: {
  courses: CourseWithModules[]
  holidayDates: ReadonlySet<string>
  target?: number
}): WeekdaySummary[] {
  const target = input.target ?? STANDARD_PROGRAM_SESSION_TARGET

  return ACTIVE_WEEKDAYS.map((weekday) => ({
    weekday,
    courses: input.courses.map((course) => {
      const sessions = computeExpectedSessions({
        dayOfWeek: weekday,
        moduleWindows: course.moduleWindows,
        holidayDates: input.holidayDates,
      })
      const lastSessionDate = sessions.at(-1) ?? null
      const lastModuleEndDate = course.moduleWindows
        .map((w) => w.endDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())
        .at(-1) ?? null

      const overflowsWindow =
        lastSessionDate !== null &&
        lastModuleEndDate !== null &&
        lastSessionDate.getTime() > lastModuleEndDate.getTime()

      return {
        courseId: course.courseId,
        courseTitle: course.courseTitle,
        level: course.level,
        computedSessions: sessions.length,
        lastSessionDate,
        lastModuleEndDate,
        target,
        overflowsWindow,
        shortOfTarget: sessions.length < target,
      }
    }),
  }))
}
