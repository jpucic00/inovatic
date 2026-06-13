/**
 * Per-group module arc — answers "which module is this ScheduledGroup actually
 * on right now" for a single calendar date, given the group's weekday and the
 * school-year holiday set.
 *
 * Race-ahead semantics: a group's Module N+1 starts on its next weekday
 * occurrence after Module N's 7th session — *not* on the slowest weekday's
 * Module N endDate. So two groups in the same course on different weekdays
 * (or with different holiday counts) can be on different modules on the same
 * calendar date.
 *
 * `ModuleSchedule.startDate / endDate` rows on the course remain the
 * slowest-weekday reference for calendar headers + admin pages, but the only
 * one this primitive reads is the first module's startDate (the school-year
 * kickoff). Per-group breaks are modeled via the holiday set, not via gaps
 * between module windows.
 */

import { addDays, collectWeekdaySessions, utcMidnight } from '@/lib/session-dates'

const SESSIONS_PER_MODULE = 7

export type GroupModuleArcEntry = {
  /** FK target for `ModuleEnrollment.moduleScheduleId`. */
  moduleScheduleId: string
  /** `CourseModule.id` — used by admin/portal UI to label the module. */
  moduleId: string
  /** 1-based ordinal of the module in its course's sortOrder. */
  moduleIndex: number
  moduleTitle: string
  /** Exactly 7 UTC-midnight dates, ascending, with holidays skipped. */
  sessionDates: Date[]
  firstSession: Date
  lastSession: Date
}

type ArcModuleInput = {
  id: string
  title: string
  sortOrder: number
  schedule: { id: string; startDate: Date | null; endDate: Date | null } | null
}

/**
 * Compute the 4×7 session arc for a group on `dayOfWeek`. Race-ahead: each
 * module's first session is the next weekday occurrence after the previous
 * module's last session. The very first module anchors at its
 * `schedule.startDate` (the school-year kickoff).
 *
 * Returns a partial arc when a module is missing its schedule or a holiday
 * cluster would push the 7th session beyond the search horizon. Callers treat
 * a short arc as "schedule incomplete" — same conservative fallback as today
 * (capacity counts all enrollments, signup hides the group).
 */
export function getGroupModuleArc(input: {
  dayOfWeek: string | null
  modules: ReadonlyArray<ArcModuleInput>
  holidayDates: ReadonlySet<string>
}): GroupModuleArcEntry[] {
  if (!input.dayOfWeek) return []
  const sorted = [...input.modules].sort((a, b) => a.sortOrder - b.sortOrder)

  const arc: GroupModuleArcEntry[] = []
  let cursor: Date | null = null
  for (let position = 0; position < sorted.length; position++) {
    const m = sorted[position]
    if (!m.schedule?.startDate) break
    const anchor = cursor ?? utcMidnight(m.schedule.startDate)
    const sessions = collectWeekdaySessions(
      anchor,
      input.dayOfWeek,
      input.holidayDates,
      SESSIONS_PER_MODULE,
    )
    if (sessions.length < SESSIONS_PER_MODULE) break
    arc.push({
      moduleScheduleId: m.schedule.id,
      moduleId: m.id,
      moduleIndex: position + 1,
      moduleTitle: m.title,
      sessionDates: sessions,
      firstSession: sessions[0],
      lastSession: sessions[SESSIONS_PER_MODULE - 1],
    })
    cursor = addDays(sessions[SESSIONS_PER_MODULE - 1], 1)
  }
  return arc
}

type GroupModuleArcState = {
  /**
   * - `pre`: no module has started yet (`asOfDate < firstSession of arc[0]`).
   * - `in`: `asOfDate` is inside some module's [firstSession, lastSession].
   * - `between`: at least one module finished, none in progress, but a next
   *   one exists (the off-session week between two race-ahead modules).
   * - `done`: every module in the arc has finished — for a complete 4-module
   *   arc this is curriculum-graduated; for a partial arc it means "all
   *   currently-dated modules are past".
   */
  state: 'pre' | 'in' | 'between' | 'done'
  inProgressModule: GroupModuleArcEntry | null
  /**
   * The next module a new enrollment would target. First arc entry whose
   * `firstSession > asOfDate`. Null when the arc has run out of future
   * modules (graduated or schedule incomplete past this point).
   */
  nextEnrollingModule: GroupModuleArcEntry | null
  lastCompletedModule: GroupModuleArcEntry | null
  completedModules: GroupModuleArcEntry[]
}

export function getActiveModuleForGroup(
  arc: ReadonlyArray<GroupModuleArcEntry>,
  asOfDate: Date,
): GroupModuleArcState {
  if (arc.length === 0) {
    return {
      state: 'pre',
      inProgressModule: null,
      nextEnrollingModule: null,
      lastCompletedModule: null,
      completedModules: [],
    }
  }

  const ms = asOfDate.getTime()
  const completed: GroupModuleArcEntry[] = []
  let inProgress: GroupModuleArcEntry | null = null
  let next: GroupModuleArcEntry | null = null

  for (const entry of arc) {
    if (entry.lastSession.getTime() < ms) {
      completed.push(entry)
    } else if (entry.firstSession.getTime() > ms) {
      next ??= entry
    } else {
      inProgress = entry
    }
  }

  let state: GroupModuleArcState['state']
  if (inProgress !== null) state = 'in'
  else if (completed.length === 0) state = 'pre'
  else if (next === null) state = 'done'
  else state = 'between'

  return {
    state,
    inProgressModule: inProgress,
    nextEnrollingModule: next,
    lastCompletedModule: completed.at(-1) ?? null,
    completedModules: completed,
  }
}
