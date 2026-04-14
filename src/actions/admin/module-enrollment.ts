'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import type { ModuleEnrollmentStatus } from '@prisma/client'

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

export async function updateModuleEnrollmentStatus(
  id: string,
  status: ModuleEnrollmentStatus,
): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const moduleEnrollment = await db.moduleEnrollment.findUnique({
      where: { id },
      include: {
        enrollment: { select: { id: true, scheduledGroupId: true } },
        moduleSchedule: {
          select: {
            module: { select: { courseId: true, sortOrder: true } },
            schoolYear: true,
          },
        },
      },
    })
    if (!moduleEnrollment) return { success: false, error: 'Upis u modul nije pronađen.' }

    await db.moduleEnrollment.update({ where: { id }, data: { status } })

    // When cancelling, also cancel future modules for this enrollment
    if (status === 'CANCELLED') {
      const { courseId, sortOrder } = moduleEnrollment.moduleSchedule.module

      // Find all future module schedules for the same course and school year
      const futureSchedules = await db.moduleSchedule.findMany({
        where: {
          module: { courseId, sortOrder: { gt: sortOrder } },
          schoolYear: moduleEnrollment.moduleSchedule.schoolYear,
        },
        select: { id: true },
      })

      if (futureSchedules.length > 0) {
        await db.moduleEnrollment.updateMany({
          where: {
            enrollmentId: moduleEnrollment.enrollmentId,
            moduleScheduleId: { in: futureSchedules.map((s) => s.id) },
            status: 'ACTIVE',
          },
          data: { status: 'CANCELLED' },
        })
      }
    }

    // Check if student has any remaining ACTIVE module enrollments
    const activeCount = await db.moduleEnrollment.count({
      where: {
        enrollmentId: moduleEnrollment.enrollmentId,
        status: 'ACTIVE',
      },
    })

    // If no active modules remain, mark the enrollment as COMPLETED
    if (activeCount === 0 && (status === 'COMPLETED' || status === 'CANCELLED')) {
      await db.enrollment.update({
        where: { id: moduleEnrollment.enrollmentId },
        data: { status: 'COMPLETED' },
      })
    }

    revalidatePath(`/admin/grupe/${moduleEnrollment.enrollment.scheduledGroupId}`)
  } catch (err) {
    console.error('updateModuleEnrollmentStatus failed:', err)
    return { success: false, error: 'Greška pri ažuriranju statusa.' }
  }

  return { success: true }
}

export async function bulkCompleteModuleEnrollments(
  groupId: string,
  moduleScheduleId: string,
): Promise<AdminActionResult> {
  await requireAdmin()

  if (!groupId || !moduleScheduleId) return { success: false, error: 'Grupa i modul su obavezni.' }

  try {
    await db.moduleEnrollment.updateMany({
      where: {
        moduleScheduleId,
        status: 'ACTIVE',
        enrollment: { scheduledGroupId: groupId, status: 'ACTIVE' },
      },
      data: { status: 'COMPLETED' },
    })

    // For enrollments with no remaining ACTIVE modules, mark as COMPLETED
    const enrollments = await db.enrollment.findMany({
      where: { scheduledGroupId: groupId, status: 'ACTIVE' },
      include: { moduleEnrollments: { where: { status: 'ACTIVE' } } },
    })

    const toComplete = enrollments
      .filter((e) => e.moduleEnrollments.length === 0)
      .map((e) => e.id)

    if (toComplete.length > 0) {
      await db.enrollment.updateMany({
        where: { id: { in: toComplete } },
        data: { status: 'COMPLETED' },
      })
    }
  } catch (err) {
    console.error('bulkCompleteModuleEnrollments failed:', err)
    return { success: false, error: 'Greška pri završavanju modula.' }
  }

  revalidatePath(`/admin/grupe/${groupId}`)
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
