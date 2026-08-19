'use server'

import { db } from '@/lib/db'
import { writeContractSigned } from '@/lib/enrollment-contract'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import {
  setModulePaidSchema,
  setEnrollmentContractSignedSchema,
  setEnrollmentMonthPaidSchema,
  setEnrollmentPaymentOptionSchema,
  setEnrollmentYearPaidSchema,
} from '@/lib/validators/admin/payment'
import { offersPaymentOption } from '@/lib/payment-option'
import type { PaymentOption } from '@prisma/client'
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
 * Record how this family settles this enrollment — "Po modulu" or "Cijela
 * školska godina", or null to take the answer back off.
 *
 * Admin-only, like every paid mark and unlike "Ugovor potpisan": it is a payment
 * fact, so it is also scrubbed out of the teacher payload rather than shared.
 *
 * Refused on any program that offers no choice, which is the same
 * `offersPaymentOption` rule the public form renders from and `submitInquiry`
 * stores by — the UI never shows the select on a radionica or a competition
 * card, and this makes sure a hand-made request cannot put one there either.
 */
export async function setEnrollmentPaymentOption(
  enrollmentId: string,
  option: PaymentOption | null,
): Promise<AdminActionResult> {
  return adminAction(
    setEnrollmentPaymentOptionSchema,
    { enrollmentId, option },
    async (d, { city }) => {
      const row = await db.enrollment.findUnique({
        where: { id: d.enrollmentId },
        select: {
          userId: true,
          scheduledGroup: { select: { city: true, course: { select: { kind: true } } } },
        },
      })
      // Cross-city rows answer exactly like nonexistent ones.
      if (row?.scheduledGroup.city !== city) {
        return { success: false, error: 'Upis nije pronađen.' }
      }
      // '' is the select's "nije odabrano" — one state with the DB's null.
      const next = d.option || null
      if (next && !offersPaymentOption(row.scheduledGroup.course.kind)) {
        return {
          success: false,
          error: 'Za ovaj program se ne bira način plaćanja.',
        }
      }

      try {
        await db.enrollment.update({
          where: { id: d.enrollmentId },
          data: { paymentOption: next },
        })
      } catch (err) {
        console.error('setEnrollmentPaymentOption failed:', err)
        return { success: false, error: 'Greška pri spremanju načina plaćanja.' }
      }

      revalidatePath(`/admin/ucenici/${row.userId}`)
      revalidatePath('/admin/ucenici')
      return { success: true }
    },
  )
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
