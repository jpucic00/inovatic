'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'

export async function deleteModuleEnrollment(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const moduleEnrollment = await db.moduleEnrollment.findUnique({
      where: { id },
      select: {
        enrollment: {
          select: {
            scheduledGroupId: true,
            schoolYear: true,
            scheduledGroup: { select: { city: true } },
          },
        },
      },
    })
    // Cross-city rows answer exactly like nonexistent ones.
    if (!moduleEnrollment || moduleEnrollment.enrollment.scheduledGroup.city !== city) {
      return { success: false, error: 'Upis u modul nije pronađen.' }
    }

    const blocked = archivedYearError(moduleEnrollment.enrollment.schoolYear)
    if (blocked) return blocked

    await db.moduleEnrollment.delete({ where: { id } })

    revalidatePath(`/admin/grupe/${moduleEnrollment.enrollment.scheduledGroupId}`)
  } catch (err) {
    console.error('deleteModuleEnrollment failed:', err)
    return { success: false, error: 'Greška pri uklanjanju iz modula.' }
  }

  return { success: true }
}

export async function closeModuleSchedule(
  moduleScheduleId: string,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!moduleScheduleId) return { success: false, error: 'Modul nije pronađen.' }

  try {
    const schedule = await db.moduleSchedule.findUnique({
      where: { id: moduleScheduleId },
      select: {
        schoolYear: true,
        city: true,
        module: {
          select: {
            course: {
              select: {
                scheduledGroups: { select: { id: true }, where: { city } },
              },
            },
          },
        },
      },
    })
    // Schedules are per-city rows: closing by id only ever ends the caller's
    // city's module. Cross-city ids read as nonexistent.
    if (!schedule || schedule.city !== city) {
      return { success: false, error: 'Modul nije pronađen.' }
    }

    const blocked = archivedYearError(schedule.schoolYear)
    if (blocked) return blocked

    await db.moduleSchedule.update({
      where: { id: moduleScheduleId },
      data: { endDate: new Date() },
    })

    for (const g of schedule.module.course.scheduledGroups) {
      revalidatePath(`/admin/grupe/${g.id}`)
    }
    revalidatePath('/admin/programi', 'layout')
  } catch (err) {
    console.error('closeModuleSchedule failed:', err)
    return { success: false, error: 'Greška pri zatvaranju modula.' }
  }

  return { success: true }
}

export async function addModuleEnrollment(
  enrollmentId: string,
  moduleScheduleId: string,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!enrollmentId || !moduleScheduleId) {
    return { success: false, error: 'Enrollment ID i modul su obavezni.' }
  }

  try {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { schoolYear: true, scheduledGroup: { select: { city: true } } },
    })
    if (!enrollment || enrollment.scheduledGroup.city !== city) {
      return { success: false, error: 'Upis nije pronađen.' }
    }

    const blocked = archivedYearError(enrollment.schoolYear)
    if (blocked) return blocked

    // Schedules are per-city: a raw moduleScheduleId must belong to the same
    // city as the enrollment's group, or payments/counts would silently pair
    // a student with the other city's module dates.
    const schedule = await db.moduleSchedule.findUnique({
      where: { id: moduleScheduleId },
      select: { city: true },
    })
    if (!schedule || schedule.city !== enrollment.scheduledGroup.city) {
      return { success: false, error: 'Modul nije pronađen.' }
    }

    await db.moduleEnrollment.create({
      data: { enrollmentId, moduleScheduleId },
    })
  } catch (err) {
    console.error('addModuleEnrollment failed:', err)
    return { success: false, error: 'Greška pri dodavanju modula.' }
  }

  return { success: true }
}
