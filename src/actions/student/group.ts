'use server'

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActiveStudent } from '@/lib/auth-guard'
import { buildGroupShell, type GroupShell } from '@/lib/group-materials-view'

/**
 * The group header + pacing for a group the logged-in student is enrolled in —
 * what the portal group layout needs to draw its heading and tab strip, without
 * loading any panel's contents.
 *
 * The enrollment lookup is the access gate, exactly as in the materials,
 * gallery and assessment reads: someone else's group 404s, indistinguishable
 * from a nonexistent one. `buildGroupShell` is request-cached, so the layout
 * and the Materijali panel underneath it share one group query.
 */
export async function getStudentGroupShell(groupId: string): Promise<GroupShell> {
  const session = await requireActiveStudent()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  return buildGroupShell(groupId)
}
