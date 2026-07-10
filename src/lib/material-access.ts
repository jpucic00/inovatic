import type { Session } from 'next-auth'
import { db } from './db'

export type CanManageTarget =
  | { scope: 'MODULE'; moduleId: string }
  | { scope: 'COURSE'; courseId: string }
  | { scope: 'GROUP'; scheduledGroupId: string }

/**
 * Determines whether the session user may create/edit/delete a material at
 * the given scope. ADMIN → any MODULE/COURSE material (shared curriculum,
 * owner decision 2026-07-10) but GROUP materials only within their own city;
 * TEACHER → must have a TeacherAssignment on the right ScheduledGroup(s) —
 * resolved per scope.
 */
export async function canManageMaterial(
  session: Session,
  target: CanManageTarget,
): Promise<boolean> {
  if (session.user.role === 'ADMIN') {
    if (target.scope !== 'GROUP') return true
    const group = await db.scheduledGroup.findUnique({
      where: { id: target.scheduledGroupId },
      select: { city: true },
    })
    return group !== null && group.city === session.user.city
  }
  if (session.user.role !== 'TEACHER') return false

  const userId = session.user.id

  if (target.scope === 'GROUP') {
    const assigned = await db.teacherAssignment.findUnique({
      where: {
        userId_scheduledGroupId: { userId, scheduledGroupId: target.scheduledGroupId },
      },
      select: { id: true },
    })
    return assigned !== null
  }

  if (target.scope === 'COURSE') {
    const assigned = await db.teacherAssignment.findFirst({
      where: {
        userId,
        scheduledGroup: { courseId: target.courseId },
      },
      select: { id: true },
    })
    return assigned !== null
  }

  const courseForModule = await db.courseModule.findUnique({
    where: { id: target.moduleId },
    select: { courseId: true },
  })
  if (!courseForModule) return false

  const assigned = await db.teacherAssignment.findFirst({
    where: {
      userId,
      scheduledGroup: { courseId: courseForModule.courseId },
    },
    select: { id: true },
  })
  return assigned !== null
}

export function materialTarget(m: {
  scope: 'MODULE' | 'COURSE' | 'GROUP'
  moduleId: string | null
  courseId: string | null
  scheduledGroupId: string | null
}): CanManageTarget | null {
  if (m.scope === 'MODULE' && m.moduleId) return { scope: 'MODULE', moduleId: m.moduleId }
  if (m.scope === 'COURSE' && m.courseId) return { scope: 'COURSE', courseId: m.courseId }
  if (m.scope === 'GROUP' && m.scheduledGroupId)
    return { scope: 'GROUP', scheduledGroupId: m.scheduledGroupId }
  return null
}
