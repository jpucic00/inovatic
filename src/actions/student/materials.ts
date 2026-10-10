'use server'

import { assertPortalGroupAccess } from '@/lib/portal-group-access'
import { buildGroupMaterialsView, type GroupMaterialsView } from '@/lib/group-materials-view'

/**
 * Fetches the effective materials for a group the caller may open: a child
 * enrolled in it, or the shared classroom login for a current-year group of its
 * city (`assertPortalGroupAccess` — a miss 404s, that's the access gate). Always
 * the STUDENT viewer: a teacher-only material must never reach the portal, and
 * this is the one portal entry point to it.
 */
export async function getEffectiveMaterialsForStudent(
  groupId: string,
): Promise<GroupMaterialsView> {
  await assertPortalGroupAccess(groupId)
  return buildGroupMaterialsView(groupId, 'STUDENT')
}
