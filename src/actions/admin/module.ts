'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { updateModuleSchema } from '@/lib/validators/admin/module'
import type { UpdateModuleInput } from '@/lib/validators/admin/module'
import type { AdminActionResult } from '@/lib/action-types'

/** Updates a ModuleSchedule's dates. The id is the ModuleSchedule id. */
export async function updateModuleSchedule(data: UpdateModuleInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateModuleSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, startDate, endDate } = parsed.data

  try {
    await db.moduleSchedule.update({
      where: { id },
      data: {
        ...(startDate !== undefined && {
          startDate: startDate ? new Date(startDate) : null,
        }),
        ...(endDate !== undefined && {
          endDate: endDate ? new Date(endDate) : null,
        }),
      },
    })
  } catch (err) {
    console.error('updateModuleSchedule failed:', err)
    return { success: false, error: 'Greška pri ažuriranju modula.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

