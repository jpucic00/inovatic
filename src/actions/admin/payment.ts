'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import {
  setModulePaidSchema,
  setEnrollmentYearPaidSchema,
} from '@/lib/validators/admin/payment'

// No archived-year guard on either action: marking late payments for past
// school years is legitimate bookkeeping, unlike enrollment mutations.

export async function setModulePaid(
  moduleEnrollmentId: string,
  paid: boolean,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = setModulePaidSchema.safeParse({ moduleEnrollmentId, paid })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const row = await db.moduleEnrollment.findUnique({
    where: { id: moduleEnrollmentId },
    select: { enrollment: { select: { userId: true } } },
  })
  if (!row) return { success: false, error: 'Upis u modul nije pronađen.' }

  try {
    await db.moduleEnrollment.update({
      where: { id: moduleEnrollmentId },
      data: { paidAt: paid ? new Date() : null },
    })
  } catch (err) {
    console.error('setModulePaid failed:', err)
    return { success: false, error: 'Greška pri spremanju plaćanja.' }
  }

  revalidatePath(`/admin/ucenici/${row.enrollment.userId}`)
  revalidatePath('/admin/ucenici')
  return { success: true }
}

export async function setEnrollmentYearPaid(
  enrollmentId: string,
  paid: boolean,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = setEnrollmentYearPaidSchema.safeParse({ enrollmentId, paid })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const row = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { userId: true },
  })
  if (!row) return { success: false, error: 'Upis nije pronađen.' }

  try {
    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { fullYearPaidAt: paid ? new Date() : null },
    })
  } catch (err) {
    console.error('setEnrollmentYearPaid failed:', err)
    return { success: false, error: 'Greška pri spremanju plaćanja.' }
  }

  revalidatePath(`/admin/ucenici/${row.userId}`)
  revalidatePath('/admin/ucenici')
  return { success: true }
}
