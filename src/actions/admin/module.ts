'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { updateModuleSchema } from '@/lib/validators/admin/module'
import type { UpdateModuleInput } from '@/lib/validators/admin/module'
import type { AdminActionResult } from '@/lib/action-types'
import { computeSchoolYear } from '@/lib/school-year'

/** Returns modules for a course with their schedule for the given school year. */
export async function getModulesForCourse(courseId: string, schoolYear?: string) {
  await requireAdmin()
  const year = schoolYear ?? computeSchoolYear()

  const modules = await db.courseModule.findMany({
    where: { courseId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      sortOrder: true,
      schedules: {
        where: { schoolYear: year },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          schoolYear: true,
          _count: {
            select: { moduleEnrollments: { where: { status: 'ACTIVE' } } },
          },
        },
      },
    },
  })

  return modules.map((mod) => {
    const schedule = mod.schedules[0] ?? null
    return {
      id: mod.id,
      title: mod.title,
      sortOrder: mod.sortOrder,
      scheduleId: schedule?.id ?? null,
      startDate: schedule?.startDate ?? null,
      endDate: schedule?.endDate ?? null,
      enrollmentCount: schedule?._count.moduleEnrollments ?? 0,
    }
  })
}

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

/** Returns the first ModuleSchedule for a course where endDate >= now (by sortOrder). */
export async function getCurrentEnrollingModule(courseId: string) {
  const now = new Date()
  const year = computeSchoolYear()

  return db.moduleSchedule.findFirst({
    where: {
      module: { courseId },
      schoolYear: year,
      endDate: { gte: now },
    },
    orderBy: { module: { sortOrder: 'asc' } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      module: {
        select: { id: true, title: true, sortOrder: true },
      },
    },
  })
}
