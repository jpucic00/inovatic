'use server'

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
