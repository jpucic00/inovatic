import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'
import { listHolidays } from '@/actions/admin/holidays'
import { toDateKey } from '@/lib/session-dates'
import { HolidayImportDialog } from '@/components/admin/school-year/holiday-import-dialog'
import {
  SchoolYearPlannerView,
  type SchoolYearCourseInput,
  type SchoolYearRadionicaGroupInput,
} from '@/components/admin/school-year/school-year-planner-view'

export const metadata: Metadata = { title: 'Admin – Školska godina' }

function formatCourseLabel(course: { title: string; level: string | null }): string {
  return course.level ? course.level.replace('_', ' ') : course.title
}

export default async function SchoolYearPage() {
  await requireAdmin()

  const schoolYear = await getSelectedSchoolYear()
  const archived = isArchivedYear(schoolYear)

  // Calendar shows holidays + module markers (standard programs) + workshop
  // labels (radionice groups whose [dateStart, dateEnd] range covers the day).
  // Standard ScheduledGroups are NOT a calendar input — they only matter for
  // attendance and the per-group teacher panel.
  const [holidays, standardCoursesRaw, customCoursesRaw, radionicaGroupsRaw] = await Promise.all([
    listHolidays(schoolYear),
    db.course.findMany({
      where: { isCustom: false },
      select: {
        id: true,
        title: true,
        level: true,
        modules: {
          select: {
            id: true,
            sortOrder: true,
            title: true,
            schedules: {
              where: { schoolYear },
              select: { startDate: true, endDate: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    }),
    db.course.findMany({
      where: {
        isCustom: true,
        modules: { some: { schedules: { some: { schoolYear } } } },
      },
      select: {
        id: true,
        title: true,
        level: true,
        modules: {
          select: {
            id: true,
            sortOrder: true,
            title: true,
            schedules: {
              where: { schoolYear },
              select: { startDate: true, endDate: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { title: 'asc' },
    }),
    db.scheduledGroup.findMany({
      where: {
        schoolYear,
        course: { isCustom: true },
        dateStart: { not: null },
        dateEnd: { not: null },
      },
      select: {
        id: true,
        dateStart: true,
        dateEnd: true,
        course: { select: { title: true } },
      },
      orderBy: { dateStart: 'asc' },
    }),
  ])

  function toCourseInput(
    course: (typeof standardCoursesRaw)[number],
  ): SchoolYearCourseInput {
    return {
      courseId: course.id,
      courseTitle: course.title,
      courseLabel: formatCourseLabel(course),
      level: course.level,
      modules: course.modules.map((m) => {
        const sched = m.schedules[0]
        return {
          id: m.id,
          sortOrder: m.sortOrder,
          title: m.title,
          startDateKey: sched?.startDate ? toDateKey(sched.startDate) : null,
          endDateKey: sched?.endDate ? toDateKey(sched.endDate) : null,
        }
      }),
    }
  }

  const standardCourses = standardCoursesRaw.map(toCourseInput)
  const customCourses = customCoursesRaw.map(toCourseInput)
  const radionicaGroups: SchoolYearRadionicaGroupInput[] = radionicaGroupsRaw.map((g) => ({
    groupId: g.id,
    dateStart: g.dateStart,
    dateEnd: g.dateEnd,
    courseTitle: g.course.title,
  }))

  const hasAnyModuleDate = standardCourses.some((c) =>
    c.modules.some((m) => m.startDateKey || m.endDateKey),
  )

  const holidayDateKeys = holidays.map((h) => h.date)
  const holidayCount = holidays.length

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
        </div>
      </header>

      {archived && <ArchivedYearBanner year={schoolYear} />}

      <SchoolYearPlannerView
        schoolYear={schoolYear}
        archived={archived}
        holidays={holidays}
        holidayDateKeys={holidayDateKeys}
        standardCourses={standardCourses}
        customCourses={customCourses}
        radionicaGroups={radionicaGroups}
        hasAnyModuleDate={hasAnyModuleDate}
      />
    </div>
  )
}
