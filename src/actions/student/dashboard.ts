'use server'

import type { City, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'
import { loadHolidayDateKeys } from '@/lib/holidays'

export type StudentEnrollmentSummary = {
  enrollmentId: string
  schoolYear: string
  group: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    course: {
      id: string
      title: string
      kind: ProgramKind
    }
    location: {
      name: string
    }
    teacherNames: string[]
  }
  activeModule: {
    id: string
    title: string
  } | null
}

/**
 * Returns enrollments for the current school year belonging to the logged-in
 * student, with the active module attached per group. Used by the portal
 * dashboard to route single vs multi-enrollment views.
 */
export async function getMyCurrentEnrollments(): Promise<StudentEnrollmentSummary[]> {
  const session = await requireStudent()

  // Current OR next year, matching the login gate exactly. Filtering on
  // `computeSchoolYear()` alone meant a child enrolled only for NEXT year — the
  // whole point of creating accounts over the summer — could log in and be shown
  // an empty dashboard.
  const enrollments = await db.enrollment.findMany({
    where: { userId: session.user.id, ...activeEnrollmentWhere() },
    orderBy: [
      { scheduledGroup: { course: { sortOrder: 'asc' } } },
      { scheduledGroup: { name: 'asc' } },
      { createdAt: 'asc' },
    ],
    include: {
      scheduledGroup: {
        include: {
          course: {
            include: {
              modules: {
                orderBy: { sortOrder: 'asc' },
                // Unfiltered on purpose: two enrollments in one payload can now
                // belong to different years, and `getCurrentActiveModuleForGroup`
                // already selects by (schoolYear, city) itself.
                include: { schedules: true },
              },
            },
          },
          location: true,
          teacherAssignments: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  })

  // Every group paces by its own city's holiday calendar, and now also by its
  // own YEAR — the payload can hold a current-year and a next-year enrollment at
  // once, and each must be paced against its own calendar.
  const calendarKeys = [
    ...new Set(enrollments.map((e) => `${e.schoolYear}:${e.scheduledGroup.city}`)),
  ]
  const holidaysByKey = new Map(
    await Promise.all(
      calendarKeys.map(async (key) => {
        const [year, city] = key.split(':')
        return [key, await loadHolidayDateKeys(year, city as City)] as const
      }),
    ),
  )

  return enrollments.map((e) => {
    const activeModule = getCurrentActiveModuleForGroup({
      dayOfWeek: e.scheduledGroup.dayOfWeek,
      modules: e.scheduledGroup.course.modules,
      // The enrollment's OWN year, not a single page-level one.
      schoolYear: e.schoolYear,
      city: e.scheduledGroup.city,
      kind: e.scheduledGroup.course.kind,
      holidayDates:
        holidaysByKey.get(`${e.schoolYear}:${e.scheduledGroup.city}`) ?? new Set(),
    })

    return {
      enrollmentId: e.id,
      schoolYear: e.schoolYear,
      group: {
        id: e.scheduledGroup.id,
        name: e.scheduledGroup.name,
        dayOfWeek: e.scheduledGroup.dayOfWeek,
        startTime: e.scheduledGroup.startTime,
        endTime: e.scheduledGroup.endTime,
        course: {
          id: e.scheduledGroup.course.id,
          title: e.scheduledGroup.course.title,
          kind: e.scheduledGroup.course.kind,
        },
        location: { name: e.scheduledGroup.location.name },
        teacherNames: e.scheduledGroup.teacherAssignments.map(
          (t) => `${t.user.firstName} ${t.user.lastName}`
        ),
      },
      activeModule: activeModule ? { id: activeModule.id, title: activeModule.title } : null,
    }
  })
}
