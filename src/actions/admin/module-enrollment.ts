'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'

export async function createModuleEnrollments(
  enrollmentId: string,
  moduleScheduleIds: string[],
): Promise<AdminActionResult> {
  await requireAdmin()

  if (!enrollmentId || moduleScheduleIds.length === 0) {
    return { success: false, error: 'Enrollment ID i moduli su obavezni.' }
  }

  try {
    await db.moduleEnrollment.createMany({
      data: moduleScheduleIds.map((moduleScheduleId) => ({
        enrollmentId,
        moduleScheduleId,
      })),
      skipDuplicates: true,
    })
  } catch (err) {
    console.error('createModuleEnrollments failed:', err)
    return { success: false, error: 'Greška pri kreiranju upisa u module.' }
  }

  return { success: true }
}

export async function deleteModuleEnrollment(id: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const moduleEnrollment = await db.moduleEnrollment.findUnique({
      where: { id },
      select: { enrollment: { select: { scheduledGroupId: true } } },
    })
    if (!moduleEnrollment) return { success: false, error: 'Upis u modul nije pronađen.' }

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
  await requireAdmin()

  if (!moduleScheduleId) return { success: false, error: 'Modul nije pronađen.' }

  try {
    const schedule = await db.moduleSchedule.findUnique({
      where: { id: moduleScheduleId },
      select: {
        module: {
          select: {
            course: {
              select: {
                scheduledGroups: { select: { id: true } },
              },
            },
          },
        },
      },
    })
    if (!schedule) return { success: false, error: 'Modul nije pronađen.' }

    await db.moduleSchedule.update({
      where: { id: moduleScheduleId },
      data: { endDate: new Date() },
    })

    for (const g of schedule.module.course.scheduledGroups) {
      revalidatePath(`/admin/grupe/${g.id}`)
    }
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
  await requireAdmin()

  if (!enrollmentId || !moduleScheduleId) {
    return { success: false, error: 'Enrollment ID i modul su obavezni.' }
  }

  try {
    await db.moduleEnrollment.create({
      data: { enrollmentId, moduleScheduleId },
    })
  } catch (err) {
    console.error('addModuleEnrollment failed:', err)
    return { success: false, error: 'Greška pri dodavanju modula.' }
  }

  return { success: true }
}
