'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { updateModuleSchema } from '@/lib/validators/admin/module'
import type { UpdateModuleInput } from '@/lib/validators/admin/module'
import type { AdminActionResult } from '@/lib/action-types'

export async function getModulesForCourse(courseId: string) {
  await requireAdmin()

  return db.courseModule.findMany({
    where: { courseId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      sortOrder: true,
      startDate: true,
      endDate: true,
    },
  })
}

export async function updateModule(data: UpdateModuleInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateModuleSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, title, startDate, endDate } = parsed.data

  try {
    await db.courseModule.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(startDate !== undefined && {
          startDate: startDate ? new Date(startDate) : null,
        }),
        ...(endDate !== undefined && {
          endDate: endDate ? new Date(endDate) : null,
        }),
      },
    })
  } catch (err) {
    console.error('updateModule failed:', err)
    return { success: false, error: 'Greška pri ažuriranju modula.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

/** Returns the first module for a course where endDate >= now (by sortOrder). */
export async function getCurrentEnrollingModule(courseId: string) {
  const now = new Date()
  return db.courseModule.findFirst({
    where: {
      courseId,
      endDate: { gte: now },
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      sortOrder: true,
      startDate: true,
      endDate: true,
    },
  })
}
