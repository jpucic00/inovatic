'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CourseLevel } from '@prisma/client'
import { CalendarPlus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { formatDate } from '@/lib/format'
import { fromDateKey, toDateKey } from '@/lib/session-dates'
import {
  computeModuleMarkers,
  computeSchoolYearPlan,
  computeWorkshopLabels,
  deriveSessionDatesFromWindows,
  type ModuleMarker,
  type WorkshopLabel,
  type PartyEvent,
} from '@/lib/school-year-planner'
import {
  ACTIVE_WEEKDAYS,
  computeWeekdaySummary,
  type CourseWithModules,
} from '@/lib/group-end-dates'
import {
  HolidayCalendar,
} from '@/components/admin/school-year/holiday-calendar'
import { WeekdayEndSummary } from '@/components/admin/school-year/weekday-end-summary'
import type { HolidayRow } from '@/actions/admin/holidays'
import { completeSchoolYearPlan } from '@/actions/admin/school-year-planner'

export type SchoolYearCourseInput = {
  courseId: string
  courseTitle: string
  /** Pre-formatted display label (e.g. "SLR 1" or course title) for tooltips. */
  courseLabel: string
  level: CourseLevel | null
  modules: Array<{
    id: string
    sortOrder: number
    title: string
    /** YYYY-MM-DD or null. Strings cross the RSC boundary cleanly. */
    startDateKey: string | null
    endDateKey: string | null
  }>
}

/**
 * One radionica ScheduledGroup with its closed [dateStart, dateEnd] range —
 * used to paint workshop names on the calendar. Strings (YYYY-MM-DD) cross
 * the RSC boundary cleanly.
 */
export type SchoolYearRadionicaGroupInput = {
  groupId: string
  dateStart: string | null
  dateEnd: string | null
  courseTitle: string
}

type Props = {
  schoolYear: string
  archived: boolean
  holidays: HolidayRow[]
  holidayDateKeys: string[]
  /** All standard programs (ProgramKind.STANDARD), modules sorted by sortOrder. */
  standardCourses: SchoolYearCourseInput[]
  /** Radionice (ProgramKind.RADIONICA). Planning never touches these. */
  customCourses: SchoolYearCourseInput[]
  /** Radionica ScheduledGroups with date ranges (for the workshop labels on the calendar). */
  radionicaGroups: SchoolYearRadionicaGroupInput[]
  /** Scheduled parties (proslave) painted on the calendar at their confirmed date. */
  partyEvents: PartyEvent[]
  /** True when any standard module already has a startDate or endDate for this year. */
  hasAnyModuleDate: boolean
}

function courseInputToWindows(
  c: SchoolYearCourseInput,
): { startDate: Date | null; endDate: Date | null }[] {
  return c.modules.map((m) => ({
    startDate: m.startDateKey ? fromDateKey(m.startDateKey) : null,
    endDate: m.endDateKey ? fromDateKey(m.endDateKey) : null,
  }))
}

export function SchoolYearPlannerView({
  schoolYear,
  archived,
  holidays,
  holidayDateKeys,
  standardCourses,
  customCourses,
  radionicaGroups,
  partyEvents,
  hasAnyModuleDate,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [plannedStartIso, setPlannedStartIso] = useState('')

  const showPlanner = !archived && !hasAnyModuleDate
  const holidaySet = useMemo(() => new Set(holidayDateKeys), [holidayDateKeys])

  const preview = useMemo(() => {
    if (!showPlanner || !plannedStartIso) return null
    // Anchor on ALL 6 active weekdays (Pon–Sub). The planner is a "plan for
    // the whole week" view — module endDates are pushed out so every weekday
    // hits 28/28, regardless of which weekdays currently have ScheduledGroups.
    // Groups exist only for the attendance system; the calendar/plan are a
    // pure projection of the schedule.
    return computeSchoolYearPlan({
      startDate: fromDateKey(plannedStartIso),
      activeWeekdays: ACTIVE_WEEKDAYS,
      holidayDates: holidaySet,
    })
  }, [showPlanner, plannedStartIso, holidaySet])

  // Standard-course module windows after applying the preview (if any) —
  // used for calendar painting + marker generation.
  const effectiveStandardCourses = useMemo<SchoolYearCourseInput[]>(() => {
    if (!preview) return standardCourses
    return standardCourses.map((c) => ({
      ...c,
      modules: c.modules.map((m, i) => {
        const window = preview.modules[i]
        return window
          ? {
              ...m,
              startDateKey: toDateKey(window.startDate),
              endDateKey: toDateKey(window.endDate),
            }
          : m
      }),
    }))
  }, [preview, standardCourses])

  const { sessionDatesByWeekday, lastSessionDateByWeekday } = useMemo(() => {
    if (preview) {
      return {
        sessionDatesByWeekday: preview.sessionDatesByWeekday,
        lastSessionDateByWeekday: preview.lastSessionDateByWeekday,
      }
    }
    return deriveSessionDatesFromWindows({
      moduleWindows: effectiveStandardCourses.flatMap(courseInputToWindows),
      holidayDates: holidaySet,
    })
  }, [preview, effectiveStandardCourses, holidaySet])

  const moduleMarkers = useMemo<ModuleMarker[]>(() => {
    const courses = [...effectiveStandardCourses, ...customCourses].map((c) => ({
      courseId: c.courseId,
      courseLabel: c.courseLabel,
      modules: c.modules.map((m) => ({
        sortOrder: m.sortOrder,
        title: m.title,
        startDate: m.startDateKey ? fromDateKey(m.startDateKey) : null,
        endDate: m.endDateKey ? fromDateKey(m.endDateKey) : null,
      })),
    }))
    return computeModuleMarkers({ courses, holidayDates: holidaySet })
  }, [effectiveStandardCourses, customCourses, holidaySet])

  const workshopLabels = useMemo<WorkshopLabel[]>(
    () => computeWorkshopLabels({ radionicaGroups }),
    [radionicaGroups],
  )

  // Bottom summary only renders when something to show. With preview,
  // synthesize CourseWithModules using each standard course's planned windows;
  // without, use the live data (filtered to courses with at least one date).
  const summary = useMemo(() => {
    if (preview) {
      const courses: CourseWithModules[] = standardCourses.map((c) => ({
        courseId: c.courseId,
        courseTitle: c.courseTitle,
        level: c.level,
        moduleWindows: preview.modules.map((m) => ({
          startDate: m.startDate,
          endDate: m.endDate,
        })),
      }))
      return computeWeekdaySummary({ courses, holidayDates: holidaySet })
    }
    if (!hasAnyModuleDate) return null
    const courses: CourseWithModules[] = standardCourses
      .filter((c) => c.modules.some((m) => m.startDateKey || m.endDateKey))
      .map((c) => ({
        courseId: c.courseId,
        courseTitle: c.courseTitle,
        level: c.level,
        moduleWindows: courseInputToWindows(c),
      }))
    if (courses.length === 0) return null
    return computeWeekdaySummary({ courses, holidayDates: holidaySet })
  }, [preview, standardCourses, hasAnyModuleDate, holidaySet])

  const canComplete = !!preview && !isPending && !archived

  function handleComplete() {
    if (!plannedStartIso) return
    startTransition(async () => {
      const res = await completeSchoolYearPlan({
        schoolYear,
        startDate: plannedStartIso,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Plan školske godine spremljen.')
      setPlannedStartIso('')
      router.refresh()
    })
  }

  return (
    <>
      {showPlanner && (
        <PlannerPanel
          plannedStartIso={plannedStartIso}
          onChangeStartIso={setPlannedStartIso}
          preview={preview}
          canComplete={canComplete}
          isPending={isPending}
          onComplete={handleComplete}
        />
      )}

      <HolidayCalendar
        schoolYear={schoolYear}
        archived={archived}
        holidays={holidays}
        sessionDatesByWeekday={sessionDatesByWeekday}
        lastSessionDateByWeekday={lastSessionDateByWeekday}
        moduleMarkers={moduleMarkers}
        workshopLabels={workshopLabels}
        partyEvents={partyEvents}
      />

      {summary && <WeekdayEndSummary summary={summary} />}
    </>
  )
}

function PlannerPanel({
  plannedStartIso,
  onChangeStartIso,
  preview,
  canComplete,
  isPending,
  onComplete,
}: Readonly<{
  plannedStartIso: string
  onChangeStartIso: (iso: string) => void
  preview: ReturnType<typeof computeSchoolYearPlan> | null
  canComplete: boolean
  isPending: boolean
  onComplete: () => void
}>) {
  return (
    <section
      className="space-y-4 rounded-lg border border-cyan-200 bg-cyan-50 p-4"
      data-school-year-planner="empty"
    >
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-cyan-900">
          <Sparkles className="h-4 w-4" aria-hidden />
          Planiraj školsku godinu
        </h2>
        <p className="text-sm text-cyan-900/90">
          Nema unesenih datuma modula za standardne programe. Unesite početni
          datum, a kalendar će automatski rasporediti 4 modula po 7 radionica
          (28 ukupno), preskačući praznike. Klikom na &ldquo;Dovrši plan&rdquo;
          izračunati datumi spremaju se na sve standardne programe.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="planner-start-date"
            className="text-xs font-medium uppercase tracking-wider text-cyan-900"
          >
            Datum početka školske godine
          </label>
          <DateInput
            id="planner-start-date"
            value={plannedStartIso}
            onChange={onChangeStartIso}
            disabled={isPending}
            className="w-44 rounded-md border border-cyan-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-xs focus-within:border-cyan-500"
          />
        </div>
        <Button
          type="button"
          onClick={onComplete}
          disabled={!canComplete}
          className="sm:ml-auto"
        >
          <CalendarPlus className="h-4 w-4" />
          Dovrši plan
        </Button>
      </div>

      {preview && (
        <div className="space-y-2 rounded-md border border-cyan-200 bg-white p-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-600">
            Pregled rasporeda modula
          </h3>
          <ul className="grid gap-1 text-sm text-gray-800 sm:grid-cols-2">
            {preview.modules.map((m) => (
              <li
                key={m.moduleIndex}
                className="flex items-center justify-between rounded border border-gray-100 px-2 py-1"
              >
                <span className="font-medium">Modul {m.moduleIndex}</span>
                <span className="font-mono text-xs text-gray-700">
                  {formatDate(m.startDate)} – {formatDate(m.endDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
