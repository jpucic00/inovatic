'use server'

import {
  assertStudentInGroup,
  assertTeacherOwnsGroup,
} from '@/lib/teacher-guard'
import type { AdminActionResult } from '@/lib/action-types'
import {
  clearAssessmentSchema,
  upsertAssessmentSchema,
} from '@/lib/validators/admin/student-assessment'
import {
  assessmentErrorMessage,
  clearStudentAssessment,
  upsertStudentAssessment,
} from '@/lib/student-assessment-core'

export async function upsertTeacherAssessment(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = upsertAssessmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  // Teacher must own the group (admins pass through, tenant-bound); student must
  // belong to it. A colleague's group / spoofed student 404s.
  const { session } = await assertTeacherOwnsGroup(parsed.data.groupId)
  await assertStudentInGroup(parsed.data.studentId, parsed.data.groupId)

  try {
    await upsertStudentAssessment(parsed.data, session.user.id)
    return { success: true }
  } catch (err) {
    console.error('upsertTeacherAssessment failed:', err)
    return { success: false, error: assessmentErrorMessage(err) }
  }
}

export async function clearTeacherAssessment(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = clearAssessmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  await assertTeacherOwnsGroup(parsed.data.groupId)
  await assertStudentInGroup(parsed.data.studentId, parsed.data.groupId)

  try {
    await clearStudentAssessment(parsed.data.studentId, parsed.data.groupId)
    return { success: true }
  } catch (err) {
    console.error('clearTeacherAssessment failed:', err)
    return { success: false, error: 'Greška pri brisanju ocjene.' }
  }
}
