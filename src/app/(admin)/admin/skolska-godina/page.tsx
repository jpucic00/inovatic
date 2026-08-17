import type { Metadata } from 'next'
import Link from 'next/link'
import { PartyPopper } from 'lucide-react'
import { requireAdminCtx } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'
import { listHolidays } from '@/actions/admin/holidays'
import { getScheduledParties } from '@/actions/admin/inquiry'
import { toDateKey } from '@/lib/session-dates'
import { formatDateKey } from '@/lib/format'
import type { PartyEvent } from '@/lib/school-year-planner'
import { HolidayImportDialog } from '@/components/admin/school-year/holiday-import-dialog'
import { TrialWeekEditor } from '@/components/admin/school-year/trial-week-editor'
import { getTrialWeek } from '@/actions/admin/trial-week'
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
  const { city } = await requireAdminCtx()

  const schoolYear = await getSelectedSchoolYear()
  const archived = isArchivedYear(schoolYear)
  const trialWeek = await getTrialWeek(schoolYear)

  // Calendar shows holidays + module markers (standard programs) + workshop
  // labels (radionice groups whose [dateStart, dateEnd] range covers the day).
  // Standard ScheduledGroups are NOT a calendar input — they only matter for
  // attendance and the per-group teacher panel.
  const [holidays, standardCoursesRaw, customCoursesRaw, radionicaGroupsRaw, scheduledPartiesRaw] = await Promise.all([
    listHolidays(schoolYear),
    db.course.findMany({
      // STANDARD only: the competitive program has no dated modules to draw.
      where: { kind: 'STANDARD' },
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
              // Calendar shows the caller's city's planner rows only.
              where: { schoolYear, city },
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
        kind: 'RADIONICA',
        OR: [{ city: null }, { city }],
        modules: { some: { schedules: { some: { schoolYear, city } } } },
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
              where: { schoolYear, city },
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
        city,
        course: { kind: 'RADIONICA' },
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
    getScheduledParties(schoolYear),
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

  const partyEvents: PartyEvent[] = scheduledPartiesRaw
    .filter((p) => p.partyConfirmedDate !== null)
    .map((p) => ({
      date: toDateKey(p.partyConfirmedDate as Date),
      time: p.partyStartTime,
      name: p.parentName,
      phone: p.parentPhone,
      email: p.parentEmail,
      message: p.message,
      inquiryId: p.id,
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
          {partyEvents.length > 0 && (
            <span className="rounded-md bg-fuchsia-50 px-2.5 py-1 text-fuchsia-800">
              Proslava: <strong>{partyEvents.length}</strong>
            </span>
          )}
        </div>
      </header>

      {archived && <ArchivedYearBanner year={schoolYear} />}

      {/* Sits above the module planner: the probni tjedan runs BEFORE module 1,
          so it is the first thing set up for a year. */}
      <TrialWeekEditor
        schoolYear={schoolYear}
        startDate={trialWeek?.startDate ?? null}
        endDate={trialWeek?.endDate ?? null}
        editable={!archived}
      />

      <SchoolYearPlannerView
        schoolYear={schoolYear}
        archived={archived}
        holidays={holidays}
        holidayDateKeys={holidayDateKeys}
        standardCourses={standardCourses}
        customCourses={customCourses}
        radionicaGroups={radionicaGroups}
        partyEvents={partyEvents}
        hasAnyModuleDate={hasAnyModuleDate}
      />

      {partyEvents.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <PartyPopper className="w-4 h-4 text-fuchsia-500" />
            Proslave — {schoolYear}
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y">
            {partyEvents.map((p) => (
              <Link
                key={p.inquiryId}
                href={`/admin/upiti/${p.inquiryId}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDateKey(p.date)}
                    {p.time ? ` u ${p.time}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {p.name} · {p.phone}
                  </p>
                </div>
                <span className="text-sm text-cyan-600 shrink-0">Otvori upit →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
