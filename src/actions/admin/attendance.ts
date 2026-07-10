'use server'

import { requireAdminCtx } from '@/lib/auth-guard'
import { assertUserInCity } from '@/lib/city-guard'
import { buildStudentAttendanceHistory } from '@/lib/student-attendance'

export type { StudentAttendanceEnrollment } from '@/lib/student-attendance'

export async function getStudentAttendance(studentId: string) {
  const { city } = await requireAdminCtx()
  await assertUserInCity(studentId, city)
  return buildStudentAttendanceHistory(studentId)
}
