'use server'

import { assertPortalGroupAccess } from '@/lib/portal-group-access'
import {
  buildGroupMaterialsView,
  toCurrentLessonOnly,
  type GroupMaterialsView,
} from '@/lib/group-materials-view'

/**
 * Fetches the effective materials for a group the caller may open: a child
 * enrolled in it, or the shared classroom login for a current-year group of its
 * city (`assertPortalGroupAccess` — a miss 404s, that's the access gate). Always
 * the STUDENT viewer: a teacher-only material must never reach the portal, and
 * this is the one portal entry point to it.
 *
 * A parent (a chosen child) gets only the CURRENT lesson of each dated section
 * (owner, 2026-10-26); the classroom computers keep the whole module so the
 * teacher can open a lesson a group missed.
 */
export async function getEffectiveMaterialsForStudent(
  groupId: string,
): Promise<GroupMaterialsView> {
  const caller = await assertPortalGroupAccess(groupId)
  const view = await buildGroupMaterialsView(groupId, 'STUDENT')
  return caller === 'CHILD' ? toCurrentLessonOnly(view) : view
}
