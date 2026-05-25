import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'
import { listHolidays } from '@/actions/admin/holidays'
import {
  ACTIVE_WEEKDAYS,
  computeWeekdaySummary,
  type CourseWithModules,
} from '@/lib/group-end-dates'
import { toDateKey } from '@/lib/session-dates'
import { HolidayCalendar, type ModuleMarker } from '@/components/admin/school-year/holiday-calendar'
import { HolidayImportDialog } from '@/components/admin/school-year/holiday-import-dialog'
import { WeekdayEndSummary } from '@/components/admin/school-year/weekday-end-summary'

export const metadata: Metadata = { title: 'Admin – Školska godina' }

export default async function SchoolYearPage() {
  await requireAdmin()

  const schoolYear = await getSelectedSchoolYear()
  const archived = isArchivedYear(schoolYear)

  const [holidays, distinctWeekdays, moduleSchedules, standardCourses] = await Promise.all([
    listHolidays(schoolYear),
    db.scheduledGroup.findMany({
      where: { schoolYear, dayOfWeek: { not: null } },
      select: { dayOfWeek: true },
      distinct: ['dayOfWeek'],
    }),
    db.moduleSchedule.findMany({
      where: { schoolYear },
      select: {
        startDate: true,
        endDate: true,
        module: {
          select: {
            title: true,
            sortOrder: true,
            course: { select: { title: true, level: true, isCustom: true } },
          },
        },
      },
    }),
    db.course.findMany({
      where: {
        isCustom: false,
        modules: { some: { schedules: { some: { schoolYear } } } },
      },
      select: {
        id: true,
        title: true,
        level: true,
        modules: {
          select: {
            schedules: {
              where: { schoolYear },
              select: { startDate: true, endDate: true },
            },
          },
        },
      },
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    }),
  ])

  const activeWeekdays = new Set(
    distinctWeekdays.map((g) => g.dayOfWeek).filter((v): v is string => v !== null),
  )

  const moduleMarkers: ModuleMarker[] = []
  for (const sched of moduleSchedules) {
    const course = sched.module.course
    const courseTag = course.level
      ? `${course.level.replace('_', ' ')} · ${sched.module.title}`
      : `${course.title} · ${sched.module.title}`
    if (sched.startDate) {
      moduleMarkers.push({
        date: toDateKey(sched.startDate),
        kind: 'start',
        label: sched.module.title,
        tooltip: `${courseTag} — početak`,
      })
    }
    if (sched.endDate) {
      moduleMarkers.push({
        date: toDateKey(sched.endDate),
        kind: 'end',
        label: sched.module.title,
        tooltip: `${courseTag} — kraj`,
      })
    }
  }

  const coursesForSummary: CourseWithModules[] = standardCourses.map((c) => ({
    courseId: c.id,
    courseTitle: c.title,
    level: c.level,
    moduleWindows: c.modules.flatMap((m) =>
      m.schedules.map((s) => ({ startDate: s.startDate, endDate: s.endDate })),
    ),
  }))

  const holidayDateSet = new Set(holidays.map((h) => h.date))
  const summary = computeWeekdaySummary({
    courses: coursesForSummary,
    holidayDates: holidayDateSet,
  })

  const holidayCount = holidays.length
  const activeWeekdayCount = activeWeekdays.size

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Školska godina {schoolYear}</h1>
          {!archived && <HolidayImportDialog schoolYear={schoolYear} archived={archived} />}
        </div>
        <p className="text-sm text-gray-600">
          Označite dane praznika kako bi automatski bili izuzeti iz evidencije dolaska. Kalendar
          ujedno prikazuje početke i krajeve modula te koliko se radionica održava po danu u
          tjednu.
        </p>
        <div className="flex flex-wrap gap-3 pt-1 text-sm text-gray-600">
          <span className="rounded-md bg-gray-100 px-2.5 py-1">
            Praznika: <strong className="text-gray-900">{holidayCount}</strong>
          </span>
          <span className="rounded-md bg-gray-100 px-2.5 py-1">
            Aktivnih dana u tjednu:{' '}
            <strong className="text-gray-900">{activeWeekdayCount}</strong> /{' '}
            {ACTIVE_WEEKDAYS.length}
          </span>
        </div>
      </header>

      {archived && <ArchivedYearBanner year={schoolYear} />}

      <HolidayCalendar
        schoolYear={schoolYear}
        archived={archived}
        holidays={holidays}
        activeWeekdays={Array.from(activeWeekdays)}
        moduleMarkers={moduleMarkers}
      />

      <WeekdayEndSummary summary={summary} />
    </div>
  )
}
