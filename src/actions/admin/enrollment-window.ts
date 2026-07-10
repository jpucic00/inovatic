'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { upsertEnrollmentWindowSchema } from '@/lib/validators/admin/enrollment-window'
import type { UpsertEnrollmentWindowInput } from '@/lib/validators/admin/enrollment-window'
import type { AdminActionResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'
import { adminAction } from '@/lib/admin-action'

export async function upsertEnrollmentWindow(
  data: UpsertEnrollmentWindowInput,
): Promise<AdminActionResult> {
  return adminAction(upsertEnrollmentWindowSchema, data, async ({ courseId, schoolYear, enrollmentStart, enrollmentEnd }, { city }) => {
    const blocked = archivedYearError(schoolYear)
    if (blocked) return blocked

    const start = enrollmentStart ? new Date(enrollmentStart) : null
    const end = enrollmentEnd ? new Date(enrollmentEnd) : null

    try {
      await db.courseEnrollmentWindow.upsert({
        where: { courseId_schoolYear_city: { courseId, schoolYear, city } },
        create: { courseId, schoolYear, city, enrollmentStart: start, enrollmentEnd: end },
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
  })
}
