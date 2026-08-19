'use server'

import { db } from '@/lib/db'
import { writeContractSigned } from '@/lib/enrollment-contract'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import {
  setModulePaidSchema,
  setEnrollmentContractSignedSchema,
  setEnrollmentMonthPaidSchema,
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
    if (row?.enrollment.scheduledGroup.city !== city) {
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

/**
 * Mark one month of a monthly-fee (COMPETITION) enrollment paid or unpaid.
 * Same city guard as the other two: the month is reached through its
 * enrollment's group, and a cross-city row answers like a missing one.
 */
export async function setEnrollmentMonthPaid(
  enrollmentMonthId: string,
  paid: boolean,
): Promise<AdminActionResult> {
  return adminAction(setEnrollmentMonthPaidSchema, { enrollmentMonthId, paid }, async (d, { city }) => {
    const row = await db.enrollmentMonth.findUnique({
      where: { id: d.enrollmentMonthId },
      select: {
        enrollment: {
          select: { userId: true, scheduledGroup: { select: { city: true } } },
        },
      },
    })
    if (row?.enrollment.scheduledGroup.city !== city) {
      return { success: false, error: 'Mjesec nije pronađen.' }
    }

    try {
      await db.enrollmentMonth.update({
        where: { id: d.enrollmentMonthId },
        data: { paidAt: d.paid ? new Date() : null },
      })
    } catch (err) {
      console.error('setEnrollmentMonthPaid failed:', err)
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
    if (row?.scheduledGroup.city !== city) {
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

/**
 * Mark this enrollment's contract signed or unsigned. Same per-enrollment grain
 * and same city guard as the paid marks above — a cross-city row answers exactly
 * like a missing one.
 *
 * The teacher twin lives in `src/actions/teacher/contract.ts`: teachers collect
 * signed contracts at the group, so unlike every paid mark this one is not
 * admin-only. Both write the same column; the guard is the only difference.
 */
export async function setEnrollmentContractSigned(
  enrollmentId: string,
  signed: boolean,
): Promise<AdminActionResult> {
  return adminAction(
    setEnrollmentContractSignedSchema,
    { enrollmentId, signed },
    async (d, { city }) => {
      const row = await db.enrollment.findUnique({
        where: { id: d.enrollmentId },
        select: { userId: true, scheduledGroup: { select: { city: true } } },
      })
      if (row?.scheduledGroup.city !== city) {
        return { success: false, error: 'Upis nije pronađen.' }
      }

      return writeContractSigned(d.enrollmentId, row.userId, signed)
    },
  )
}
