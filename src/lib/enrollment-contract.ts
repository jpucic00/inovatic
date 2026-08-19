import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { AdminActionResult } from '@/lib/action-types'

/**
 * The shared write behind both the admin and the teacher "Ugovor potpisan"
 * action, so the column, the error copy and the revalidation set can never
 * drift between the two callers — only the guard in front of it differs.
 *
 * It lives HERE, in a plain module, and deliberately NOT in `src/actions/**`:
 * every exported async function in a `'use server'` file is registered as its
 * own callable Server Action, so exporting an unguarded write from one hands
 * out an endpoint that skips both wrappers' checks (the admin city guard and
 * the teacher's `assertTeacherOwnsGroup`). Same reason `student-assessment-core`
 * and `evaluation-email-cards` hold their shared logic outside the action files.
 */
export async function writeContractSigned(
  enrollmentId: string,
  studentId: string,
  signed: boolean,
): Promise<AdminActionResult> {
  try {
    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { contractSignedAt: signed ? new Date() : null },
    })
  } catch (err) {
    console.error('writeContractSigned failed:', err)
    return { success: false, error: 'Greška pri spremanju ugovora.' }
  }

  revalidatePath(`/admin/ucenici/${studentId}`)
  revalidatePath('/admin/ucenici')
  revalidatePath(`/nastavnik/ucenik/${studentId}`)
  return { success: true }
}
