'use server'

import { db } from '@/lib/db'
import { assertTeacherCanViewStudent } from '@/lib/teacher-guard'
import { buildStudentDetailForTeacher } from '@/lib/student-detail'
import { buildStudentAttendanceHistory } from '@/lib/student-attendance'

export async function getStudentForTeacher(studentId: string) {
  await assertTeacherCanViewStudent(studentId)
  return buildStudentDetailForTeacher(studentId)
}

export async function getStudentAttendanceForTeacher(studentId: string) {
  await assertTeacherCanViewStudent(studentId)
  return buildStudentAttendanceHistory(studentId)
}

/**
 * Resolves the `?grupa=` a student was opened from into a back-link target.
 *
 * Deliberately the non-throwing twin of `assertTeacherOwnsGroup`: a stale,
 * foreign or hand-edited id costs the caller its back link, never the page —
 * 404-ing a student profile over a query param would be a worse bug than the
 * one this fixes. The group must both hold this student and be one the caller
 * may actually open (own assignment; for an admin, own city), so the link can
 * never point somewhere that 404s on click.
 */
export async function getStudentGroupContext(studentId: string, groupId: string) {
  const { session, isAdmin } = await assertTeacherCanViewStudent(studentId)

  return db.scheduledGroup.findFirst({
    where: {
      id: groupId,
      enrollments: { some: { userId: studentId } },
      ...(isAdmin
        ? { city: session.user.city }
        : { teacherAssignments: { some: { userId: session.user.id } } }),
    },
    select: { id: true, name: true },
  })
}
