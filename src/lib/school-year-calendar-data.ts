/**
 * The Kalendar's inputs, loaded once for the two things that draw a school
 * year: the `/admin/skolska-godina` page and the printable PDF. Sharing the
 * query is the point — a PDF computed from a different set of windows or
 * holidays would hand parents dates the Kalendar does not show.
 *
 * A plain module, not `'use server'`: it takes a city with no guard of its own,
 * and every export of an action file would be a callable endpoint.
 */
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { toDateKey } from '@/lib/session-dates'
import { deriveSessionDatesFromWindows } from '@/lib/school-year-planner'
import {
  buildSchoolYearCalendar,
  incompleteWeekdays,
  standardModuleWindows,
  type SchoolYearCalendar,
} from '@/lib/school-year-calendar'
import type { SchoolYearCourseInput } from '@/components/admin/school-year/school-year-planner-view'

type CoursePlanRow = {
  id: string
  title: string
  level: SchoolYearCourseInput['level']
  modules: {
    id: string
    sortOrder: number
    title: string
    schedules: { startDate: Date | null; endDate: Date | null }[]
  }[]
}

export function coursePlanSelect(schoolYear: string, city: City) {
  return {
    id: true,
    title: true,
    level: true,
    modules: {
      select: {
        id: true,
        sortOrder: true,
        title: true,
        schedules: {
          // Each city plans the shared curriculum on its own dates.
          where: { schoolYear, city },
          select: { startDate: true, endDate: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    },
  } as const
}

export function toCoursePlanInput(course: CoursePlanRow): SchoolYearCourseInput {
  return {
    courseId: course.id,
    courseTitle: course.title,
    courseLabel: course.level ? course.level.replace('_', ' ') : course.title,
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

/** Every standard program with its module windows for (city, year). */
export async function loadStandardCoursePlans(
  city: City,
  schoolYear: string,
): Promise<SchoolYearCourseInput[]> {
  const rows = await db.course.findMany({
    // STANDARD only: the competitive program has no dated modules to draw, and
    // radionice do not follow the 28-termin year.
    where: { kind: 'STANDARD' },
    select: coursePlanSelect(schoolYear, city),
    orderBy: [{ level: 'asc' }, { title: 'asc' }],
  })
  return rows.map(toCoursePlanInput)
}

type CalendarLoad =
  | { ok: true; calendar: SchoolYearCalendar }
  | { ok: false; error: string }

/**
 * The year's calendar exactly as the Kalendar derives it — or the reason it
 * cannot be printed. Probni tjedan is deliberately absent: it is not part of
 * the 28 termini, and this document is the programme's own timetable.
 */
export async function loadSchoolYearCalendar(
  city: City,
  schoolYear: string,
): Promise<CalendarLoad> {
  const [standardCourses, holidayRows] = await Promise.all([
    loadStandardCoursePlans(city, schoolYear),
    db.schoolYearHoliday.findMany({
      where: { schoolYear, city },
      orderBy: { date: 'asc' },
      select: { date: true, name: true },
    }),
  ])
  const holidays = holidayRows.map((h) => ({ dateKey: toDateKey(h.date), name: h.name }))
  const sessions = deriveSessionDatesFromWindows({
    moduleWindows: standardModuleWindows(standardCourses),
    holidayDates: new Set(holidays.map((h) => h.dateKey)),
  })

  if (incompleteWeekdays(sessions).length > 0) {
    return {
      ok: false,
      error: `Školska godina ${schoolYear} nema dovršen plan — nemaju svi dani u tjednu 28 radionica. Dovršite plan u Kalendaru.`,
    }
  }
  return { ok: true, calendar: buildSchoolYearCalendar({ ...sessions, holidays }) }
}
