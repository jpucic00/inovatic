import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActiveStudent, requirePortalUser } from '@/lib/auth-guard'
import { classroomGroupWhere } from '@/lib/classroom-access'

/**
 * The access gate for a group's MATERIALS in the portal — the one read the
 * shared classroom login may make alongside a child.
 *
 * STUDENT: exactly the gate the materials/gallery/assessment reads always had —
 * `requireActiveStudent()` (currently in a program) plus an enrollment in this
 * group, any year. CLASSROOM: the group is one of its city's current-year
 * groups (`classroomGroupWhere`). Either miss is `notFound()`, indistinguishable
 * from a nonexistent group, and never `redirect('/portal')` — that would loop
 * from inside the portal.
 *
 * Deliberately NOT used by the gallery, evaluation or profile reads: those stay
 * behind `requireStudent()`, which is what keeps them off the classroom PCs.
 *
 * Plain module, not a `'use server'` file: an export from one of those is a
 * callable endpoint, and this is a guard, not an action.
 */
export async function assertPortalGroupAccess(
  groupId: string,
): Promise<void> {
  const session = await requirePortalUser()

  if (session.user.role === 'CLASSROOM') {
    const group = await db.scheduledGroup.findFirst({
      where: { id: groupId, ...classroomGroupWhere(session.user.city) },
      select: { id: true },
    })
    if (!group) notFound()
    return
  }

  await requireActiveStudent()
  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()
}
