'use server'

import { assertPortalGroupAccess } from '@/lib/portal-group-access'
import { buildGroupShell, type GroupShell } from '@/lib/group-materials-view'

/**
 * The group header + pacing for a group the logged-in student is enrolled in —
 * what the portal group layout needs to draw its heading and tab strip, without
 * loading any panel's contents.
 *
 * `assertPortalGroupAccess` is the gate — a child's enrollment, or the shared
 * classroom login's city + current year — exactly as in the materials read;
 * someone else's group 404s, indistinguishable from a nonexistent one.
 * `buildGroupShell` is request-cached, so the layout and the Materijali panel
 * underneath it share one group query.
 */
export async function getStudentGroupShell(groupId: string): Promise<GroupShell> {
  await assertPortalGroupAccess(groupId)
  return buildGroupShell(groupId)
}
