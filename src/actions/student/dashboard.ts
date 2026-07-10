'use server'

import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { computeSchoolYear } from '@/lib/school-year'
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
      isCustom: boolean
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
  const schoolYear = computeSchoolYear()

  const enrollments = await db.enrollment.findMany({
    where: { userId: session.user.id, schoolYear },
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
                include: {
                  schedules: { where: { schoolYear } },
                },
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

  // Every group paces by its own city's holiday calendar. A student's
  // enrollments are all same-city by invariant, but keying per group keeps
  // this correct even if that ever changes.
  const cities = [...new Set(enrollments.map((e) => e.scheduledGroup.city))]
  const holidaysByCity = new Map(
    await Promise.all(
      cities.map(
        async (c) => [c, await loadHolidayDateKeys(schoolYear, c)] as const,
      ),
    ),
  )

  return enrollments.map((e) => {
    const activeModule = getCurrentActiveModuleForGroup({
      dayOfWeek: e.scheduledGroup.dayOfWeek,
      modules: e.scheduledGroup.course.modules,
      schoolYear,
      city: e.scheduledGroup.city,
      holidayDates: holidaysByCity.get(e.scheduledGroup.city) ?? new Set(),
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
          isCustom: e.scheduledGroup.course.isCustom,
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
