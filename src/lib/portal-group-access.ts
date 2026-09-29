import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActivePortalChild, requirePortalUser } from '@/lib/auth-guard'
import { classroomGroupWhere } from '@/lib/classroom-access'

/**
 * The access gate for a group's MATERIALS in the portal — the one read the
 * shared classroom login may make alongside a child.
 *
 * A child (the session's picked `studentId`): exactly the gate the
 * materials/gallery/assessment reads always had — `requireActivePortalChild()`
 * (currently in a program) plus an enrollment in this group, any year. CLASSROOM: the group is one of its city's current-year
 * groups (`classroomGroupWhere`). Either miss is `notFound()`, indistinguishable
 * from a nonexistent group, and never `redirect('/portal')` — that would loop
 * from inside the portal.
 *
 * Deliberately NOT used by the gallery, evaluation or profile reads: those stay
 * behind `requirePortalChild()`, which is what keeps them off the classroom PCs.
 *
 * Plain module, not a `'use server'` file: an export from one of those is a
 * callable endpoint, and this is a guard, not an action.
 */
export async function assertPortalGroupAccess(
  groupId: string,
): Promise<void> {
  const { session, studentId } = await requirePortalUser()

  if (studentId === null) {
    const group = await db.scheduledGroup.findFirst({
      where: { id: groupId, ...classroomGroupWhere(session.user.city) },
      select: { id: true },
    })
    if (!group) notFound()
    return
  }

  await requireActivePortalChild()
  const enrollment = await db.enrollment.findFirst({
    where: { userId: studentId, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()
}
