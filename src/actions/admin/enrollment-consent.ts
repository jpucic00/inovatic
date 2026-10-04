'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { adminAction } from '@/lib/admin-action'
import type { AdminActionResult } from '@/lib/action-types'
import {
  setEnrollmentConsentsSchema,
  type SetEnrollmentConsentsInput,
} from '@/lib/validators/admin/enrollment-consent'
import { pickConsents } from '@/lib/enrollment-consent'

/**
 * Write all four privole of one enrollment at once — they arrive together, on
 * the form signed with the contract, and are entered together in one dialog.
 *
 * Admin-only by owner decision (2026-10-04), unlike "Ugovor potpisan": teachers
 * read the consents (profile, Dolazak) but have no twin action. No archived-year
 * guard — correcting an earlier year's form is bookkeeping, like the paid marks.
 */
export async function setEnrollmentConsents(
  input: SetEnrollmentConsentsInput,
): Promise<AdminActionResult> {
  return adminAction(setEnrollmentConsentsSchema, input, async (d, { city }) => {
    const row = await db.enrollment.findUnique({
      where: { id: d.enrollmentId },
      select: { userId: true, scheduledGroupId: true, scheduledGroup: { select: { city: true } } },
    })
    // Cross-city rows answer exactly like nonexistent ones.
    if (row?.scheduledGroup.city !== city) {
      return { success: false, error: 'Upis nije pronađen.' }
    }

    try {
      await db.enrollment.update({ where: { id: d.enrollmentId }, data: pickConsents(d) })
    } catch (err) {
      console.error('setEnrollmentConsents failed:', err)
      return { success: false, error: 'Greška pri spremanju privola.' }
    }

    revalidatePath(`/admin/ucenici/${row.userId}`)
    revalidatePath('/admin/ucenici')
    revalidatePath(`/nastavnik/ucenik/${row.userId}`)
    revalidatePath(`/nastavnik/grupa/${row.scheduledGroupId}/dolazak`)
    return { success: true }
  })
}
