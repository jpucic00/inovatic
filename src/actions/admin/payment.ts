'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import {
  setModulePaidSchema,
  setEnrollmentYearPaidSchema,
} from '@/lib/validators/admin/payment'
import { adminAction } from '@/lib/admin-action'

// No archived-year guard on either action: marking late payments for past
// school years is legitimate bookkeeping, unlike enrollment mutations.

export async function setModulePaid(
  moduleEnrollmentId: string,
  paid: boolean,
): Promise<AdminActionResult> {
  return adminAction(setModulePaidSchema, { moduleEnrollmentId, paid }, async (d, { city }) => {
    const row = await db.moduleEnrollment.findUnique({
      where: { id: d.moduleEnrollmentId },
      select: {
        enrollment: {
          select: { userId: true, scheduledGroup: { select: { city: true } } },
        },
      },
    })
    // Cross-city rows answer exactly like nonexistent ones.
    if (!row || row.enrollment.scheduledGroup.city !== city) {
      return { success: false, error: 'Upis u modul nije pronađen.' }
    }

    try {
      await db.moduleEnrollment.update({
        where: { id: d.moduleEnrollmentId },
        data: { paidAt: d.paid ? new Date() : null },
      })
    } catch (err) {
      console.error('setModulePaid failed:', err)
      return { success: false, error: 'Greška pri spremanju plaćanja.' }
    }

    revalidatePath(`/admin/ucenici/${row.enrollment.userId}`)
    revalidatePath('/admin/ucenici')
    return { success: true }
  })
}

export async function setEnrollmentYearPaid(
  enrollmentId: string,
  paid: boolean,
): Promise<AdminActionResult> {
  return adminAction(setEnrollmentYearPaidSchema, { enrollmentId, paid }, async (d, { city }) => {
    const row = await db.enrollment.findUnique({
      where: { id: d.enrollmentId },
      select: { userId: true, scheduledGroup: { select: { city: true } } },
    })
    if (!row || row.scheduledGroup.city !== city) {
      return { success: false, error: 'Upis nije pronađen.' }
    }

    try {
      await db.enrollment.update({
        where: { id: d.enrollmentId },
        data: { fullYearPaidAt: d.paid ? new Date() : null },
      })
    } catch (err) {
      console.error('setEnrollmentYearPaid failed:', err)
      return { success: false, error: 'Greška pri spremanju plaćanja.' }
    }

    revalidatePath(`/admin/ucenici/${row.userId}`)
    revalidatePath('/admin/ucenici')
    return { success: true }
  })
}
