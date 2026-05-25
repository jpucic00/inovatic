import { db } from '@/lib/db'
import { isArchivedYear } from '@/lib/school-year'
import type { AdminActionResult } from '@/lib/action-types'

// Narrowed to the failure variant so actions with richer success shapes
// (e.g. CreateStudentResult) can still `return archived` without TS complaining
// that the success branch is missing fields.
type ArchivedFailure = Extract<AdminActionResult, { success: false }>

const ARCHIVED_ERROR: ArchivedFailure = Object.freeze({
  success: false,
  error: 'Arhivirana školska godina je samo za pregled.',
})

/** Error result when the year is archived (read-only), otherwise null. */
export function archivedYearError(year: string): ArchivedFailure | null {
  return isArchivedYear(year) ? ARCHIVED_ERROR : null
}

/** Same, resolving the year from the group's own record. */
export async function archivedGroupError(
  groupId: string,
): Promise<ArchivedFailure | null> {
  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { schoolYear: true },
  })
  if (!group) return { success: false, error: 'Grupa nije pronađena.' }
  return archivedYearError(group.schoolYear)
}
