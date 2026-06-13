'use server'

import { db } from '@/lib/db'
import { assertTeacherCanViewStudent } from '@/lib/teacher-guard'
import { toDateKey } from '@/lib/session-dates'
import type {
  StudentAttendanceEnrollment,
  StudentAttendanceRow,
} from '@/actions/admin/attendance'

/**
 * Mirrors `getStudent` from the admin namespace, but gated by
 * `assertTeacherCanViewStudent` so teachers may view profiles of any student
 * they share a group with. Returns the same shape as the admin action so the
 * shared `<StudentDetailView>` works for both roles.
 */
export async function getStudentForTeacher(studentId: string) {
  await assertTeacherCanViewStudent(studentId)

  const student = await db.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    include: {
      enrollments: {
        include: {
          scheduledGroup: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  level: true,
                  isCustom: true,
                  modules: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      title: true,
                      sortOrder: true,
                      schedules: {
                        select: {
                          id: true,
                          schoolYear: true,
                          startDate: true,
                          endDate: true,
                        },
                      },
                    },
                  },
                },
              },
              location: { select: { name: true, address: true } },
            },
          },
          moduleEnrollments: {
            include: {
              moduleSchedule: {
                select: {
                  id: true,
                  schoolYear: true,
                  module: { select: { id: true, title: true, sortOrder: true } },
                },
              },
            },
            orderBy: { moduleSchedule: { module: { sortOrder: 'asc' } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      studentComments: {
        include: {
          author: { select: { id: true, firstName: true, lastName: true, role: true, deletedAt: true } },
          module: { select: { id: true, title: true } },
          group: {
            select: {
              id: true,
              name: true,
              schoolYear: true,
              course: { select: { title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!student) return null

  // Payment data is admin-only. Scrub it at the boundary so it never ships in
  // the teacher page's RSC payload, even though the UI is also gated by isAdmin.
  return {
    ...student,
    enrollments: student.enrollments.map((e) => ({
      ...e,
      fullYearPaidAt: null,
      moduleEnrollments: e.moduleEnrollments.map((me) => ({ ...me, paidAt: null })),
    })),
  }
}

/**
 * Mirrors `getStudentAttendance` from the admin namespace with teacher auth.
 * Returns aggregated attendance grouped by enrollment.
 */
export async function getStudentAttendanceForTeacher(
  studentId: string,
): Promise<StudentAttendanceEnrollment[]> {
  await assertTeacherCanViewStudent(studentId)

  const enrollments = await db.enrollment.findMany({
    where: { userId: studentId },
    orderBy: [{ schoolYear: 'desc' }, { createdAt: 'desc' }],
    include: {
      scheduledGroup: {
        select: {
          id: true,
          name: true,
          course: { select: { title: true } },
        },
      },
      attendances: {
        orderBy: { sessionDate: 'desc' },
        include: {
          recordedBy: { select: { firstName: true, lastName: true, deletedAt: true } },
        },
      },
    },
  })

  return enrollments.map((e) => {
    const rows: StudentAttendanceRow[] = e.attendances.map((a) => ({
      sessionDate: toDateKey(a.sessionDate),
      present: a.present,
      note: a.note,
      recordedBy: a.recordedBy
        ? `${a.recordedBy.firstName} ${a.recordedBy.lastName}`
        : null,
      recordedByDeleted: a.recordedBy?.deletedAt != null,
    }))
    const presentCount = rows.filter((r) => r.present).length
    return {
      enrollmentId: e.id,
      groupId: e.scheduledGroup.id,
      groupName: e.scheduledGroup.name,
      courseTitle: e.scheduledGroup.course.title,
      schoolYear: e.schoolYear,
      rows,
      presentCount,
      absentCount: rows.length - presentCount,
    }
  })
}
