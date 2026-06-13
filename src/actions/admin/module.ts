'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { upsertModuleScheduleSchema } from '@/lib/validators/admin/module'
import type { UpsertModuleScheduleInput } from '@/lib/validators/admin/module'
import type { AdminActionResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'

/**
 * Creates or updates the schedule (start/end dates) for a module in a given
 * school year. Upserts on the (moduleId, schoolYear) unique so a blank year
 * can be filled in from scratch.
 */
export async function upsertModuleSchedule(
  data: UpsertModuleScheduleInput,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = upsertModuleScheduleSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { moduleId, schoolYear, startDate, endDate } = parsed.data

  const blocked = archivedYearError(schoolYear)
  if (blocked) return blocked

  try {
    await db.moduleSchedule.upsert({
      where: { moduleId_schoolYear: { moduleId, schoolYear } },
      create: {
        moduleId,
        schoolYear,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
      update: {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    })
  } catch (err) {
    console.error('upsertModuleSchedule failed:', err)
    return { success: false, error: 'Greška pri spremanju datuma modula.' }
  }

  revalidatePath('/admin/programi', 'layout')
  return { success: true }
}
