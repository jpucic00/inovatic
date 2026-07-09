'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { upsertModuleScheduleSchema } from '@/lib/validators/admin/module'
import type { UpsertModuleScheduleInput } from '@/lib/validators/admin/module'
import type { AdminActionResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'
import { adminAction } from '@/lib/admin-action'

export async function upsertModuleSchedule(
  data: UpsertModuleScheduleInput,
): Promise<AdminActionResult> {
  return adminAction(upsertModuleScheduleSchema, data, async ({ moduleId, schoolYear, startDate, endDate }) => {
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
  })
}
