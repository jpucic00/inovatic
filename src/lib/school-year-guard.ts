import { db } from '@/lib/db'
import { isArchivedYear } from '@/lib/school-year'
import type { AdminActionResult } from '@/lib/action-types'

const ARCHIVED_ERROR: AdminActionResult = {
  success: false,
  error: 'Arhivirana školska godina je samo za pregled.',
}

/** Error result when the year is archived (read-only), otherwise null. */
export function archivedYearError(year: string): AdminActionResult | null {
  return isArchivedYear(year) ? ARCHIVED_ERROR : null
}

/** Same, resolving the year from the group's own record. */
export async function archivedGroupError(
  groupId: string,
): Promise<AdminActionResult | null> {
  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { schoolYear: true },
  })
  if (!group) return { success: false, error: 'Grupa nije pronađena.' }
  return archivedYearError(group.schoolYear)
}
