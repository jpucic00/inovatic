'use server'

import { requireAdminCtx } from '@/lib/auth-guard'
import { assertGroupInCity, assertUserInCity } from '@/lib/city-guard'
import { db } from '@/lib/db'
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

export async function upsertAssessment(
  input: unknown,
): Promise<AdminActionResult> {
  const { session, city } = await requireAdminCtx()
  const authorId = session.user.id
  if (!authorId) return { success: false, error: 'Neautorizirano.' }

  const parsed = upsertAssessmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  // Cross-city targets 404 like nonexistent ids — city comes from the session.
  await assertGroupInCity(parsed.data.groupId, city)
  await assertUserInCity(parsed.data.studentId, city)

  // Same contract as the teacher path (assertStudentInGroup): a report card
  // exists only for a student actually enrolled in that group.
  const enrolled = await db.enrollment.findFirst({
    where: {
      userId: parsed.data.studentId,
      scheduledGroupId: parsed.data.groupId,
    },
    select: { id: true },
  })
  if (!enrolled) {
    return { success: false, error: 'Učenik nije upisan u ovu grupu.' }
  }

  try {
    await upsertStudentAssessment(parsed.data, authorId)
    return { success: true }
  } catch (err) {
    console.error('upsertAssessment failed:', err)
    return { success: false, error: assessmentErrorMessage(err) }
  }
}

export async function clearAssessment(
  input: unknown,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = clearAssessmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  await assertGroupInCity(parsed.data.groupId, city)

  try {
    await clearStudentAssessment(parsed.data.studentId, parsed.data.groupId)
    return { success: true }
  } catch (err) {
    console.error('clearAssessment failed:', err)
    return { success: false, error: 'Greška pri brisanju ocjene.' }
  }
}
