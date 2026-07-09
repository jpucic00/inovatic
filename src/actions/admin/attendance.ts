'use server'

import { requireAdmin } from '@/lib/auth-guard'
import { buildStudentAttendanceHistory } from '@/lib/student-attendance'

export type { StudentAttendanceEnrollment } from '@/lib/student-attendance'

export async function getStudentAttendance(studentId: string) {
  await requireAdmin()
  return buildStudentAttendanceHistory(studentId)
}
