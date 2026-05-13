'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { toDateKey } from '@/lib/session-dates'

export type StudentAttendanceRow = {
  sessionDate: string // YYYY-MM-DD
  present: boolean
  note: string | null
  recordedBy: string | null
  recordedByDeleted: boolean
}

export type StudentAttendanceEnrollment = {
  enrollmentId: string
  groupId: string
  groupName: string | null
  courseTitle: string
  schoolYear: string
  rows: StudentAttendanceRow[]
  presentCount: number
  absentCount: number
}

/**
 * Aggregated attendance history for a single student, grouped by enrollment.
 * Used by the admin student detail page to answer parent questions like
 * "was my kid at class last Tuesday?".
 */
export async function getStudentAttendance(
  studentId: string,
): Promise<StudentAttendanceEnrollment[]> {
  await requireAdmin()

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
