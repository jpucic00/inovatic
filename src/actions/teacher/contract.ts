'use server'

import { db } from '@/lib/db'
import type { AdminActionResult } from '@/lib/action-types'
import { writeContractSigned } from '@/lib/enrollment-contract'
import { setEnrollmentContractSignedSchema } from '@/lib/validators/admin/payment'
import { requireTeacher } from '@/lib/auth-guard'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import { computeSchoolYear } from '@/lib/school-year'

/**
 * Teacher twin of `setEnrollmentContractSigned`. Teachers collect the signed
 * contracts at the group, so this is the one enrollment mark that is not
 * admin-only — every paid mark stays scrubbed out of the teacher payload.
 *
 * The enrollment is resolved first and the guard runs against ITS group, not a
 * client-supplied group id, so a teacher can only sign for a roster they
 * actually own. `assertTeacherOwnsGroup` also carries the tenant-bound admin
 * pass-through, which is what lets a teaching admin (Slavica) use this from the
 * same panel — and 404s a cross-city group exactly like a nonexistent one.
 */
export async function setEnrollmentContractSignedByTeacher(
  enrollmentId: string,
  signed: boolean,
): Promise<AdminActionResult> {
  // Authorise BEFORE any lookup. `assertTeacherOwnsGroup` below calls this too,
  // but it can only run once an enrollment has been resolved — and resolving one
  // first would let an unauthenticated or STUDENT caller probe whether an
  // enrollment id exists by reading the error message.
  await requireTeacher()

  const parsed = setEnrollmentContractSignedSchema.safeParse({ enrollmentId, signed })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const enrollment = await db.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { userId: true, scheduledGroupId: true, schoolYear: true },
  })
  // A missing enrollment answers like a foreign one — neither tells the caller
  // whether the id exists.
  if (!enrollment) return { success: false, error: 'Upis nije pronađen.' }

  const { isAdmin } = await assertTeacherOwnsGroup(enrollment.scheduledGroupId)

  // A past year's contracts are settled. Marking one now is a correction, and
  // corrections are the admin's job everywhere else in this app — the same
  // split `teacherMarkingWindow` draws for attendance, where a teacher may only
  // record the current month and an admin is unrestricted. A teaching admin
  // (Slavica) passes through here as an admin, not as the group's teacher.
  if (!isAdmin && enrollment.schoolYear !== computeSchoolYear()) {
    return {
      success: false,
      error:
        'Ugovor možete označiti samo za tekuću školsku godinu. Za raniju godinu javite se administratoru.',
    }
  }

  return writeContractSigned(parsed.data.enrollmentId, enrollment.userId, parsed.data.signed)
}
