'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActiveStudent } from '@/lib/auth-guard'
import { buildGroupMaterialsView, type GroupMaterialsView } from '@/lib/group-materials-view'

/**
 * Fetches the effective materials for a group that the logged-in student is
 * enrolled in. Throws a 404 if the student has no enrollment for this group —
 * that's the access gate. The kind-partitioned view shape is built by the
 * shared `buildGroupMaterialsView` core (also used by the teacher scene view).
 */
export async function getEffectiveMaterialsForStudent(
  groupId: string,
): Promise<GroupMaterialsView> {
  const session = await requireActiveStudent()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  return buildGroupMaterialsView(groupId)
}
