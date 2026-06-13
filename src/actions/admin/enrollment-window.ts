'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { upsertEnrollmentWindowSchema } from '@/lib/validators/admin/enrollment-window'
import type { UpsertEnrollmentWindowInput } from '@/lib/validators/admin/enrollment-window'
import type { AdminActionResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'

/**
 * Creates or updates the public signup window for a program in a given school
 * year. Upserts on the (courseId, schoolYear) unique so a blank year can be
 * filled in from scratch. Passing empty dates clears the window (closes
 * signups). Every group of the program inherits this window.
 */
export async function upsertEnrollmentWindow(
  data: UpsertEnrollmentWindowInput,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = upsertEnrollmentWindowSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { courseId, schoolYear, enrollmentStart, enrollmentEnd } = parsed.data

  const blocked = archivedYearError(schoolYear)
  if (blocked) return blocked

  const start = enrollmentStart ? new Date(enrollmentStart) : null
  const end = enrollmentEnd ? new Date(enrollmentEnd) : null

  try {
    await db.courseEnrollmentWindow.upsert({
      where: { courseId_schoolYear: { courseId, schoolYear } },
      create: { courseId, schoolYear, enrollmentStart: start, enrollmentEnd: end },
      update: { enrollmentStart: start, enrollmentEnd: end },
    })
  } catch (err) {
    console.error('upsertEnrollmentWindow failed:', err)
    return { success: false, error: 'Greška pri spremanju prozora upisa.' }
  }

  revalidatePath('/admin/programi', 'layout')
  revalidatePath('/admin/grupe', 'layout')
  revalidatePath('/upisi')
  revalidatePath('/radionice', 'layout')
  return { success: true }
}
