'use server'

import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { computeSchoolYear } from '@/lib/school-year'
import { getCurrentActiveModule } from '@/lib/active-module'

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
    orderBy: { createdAt: 'asc' },
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

  return enrollments.map((e) => {
    const activeModule = getCurrentActiveModule(
      e.scheduledGroup.course.modules,
      schoolYear
    )

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
