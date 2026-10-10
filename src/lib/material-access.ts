import type { Session } from 'next-auth'
import type { City } from '@prisma/client'
import { db } from './db'

export type CanManageTarget =
  | { scope: 'LESSON'; lessonId: string }
  | { scope: 'MODULE'; moduleId: string }
  | { scope: 'COURSE'; courseId: string }
  | { scope: 'GROUP'; scheduledGroupId: string }

/**
 * Determines whether the session user may create/edit/delete a material at
 * the given scope. ADMIN → any LESSON/MODULE/COURSE material (shared
 * curriculum, owner decision 2026-07-10) but GROUP materials only within their
 * own city; TEACHER → must have a TeacherAssignment on the right
 * ScheduledGroup(s) — resolved per scope.
 *
 * For a TEACHER on a program-level scope this is a READ answer (it is also the
 * `/api/download` gate): the CRUD actions separately restrict teachers to
 * creating GROUP rows and editing their own uploads.
 */
export async function canManageMaterial(
  session: Session,
  target: CanManageTarget,
): Promise<boolean> {
  if (session.user.role === 'ADMIN') {
    if (target.scope !== 'GROUP') {
      // A shared program (city null) is every admin's curriculum; a radionica
      // belongs to its city, so another city's admin is refused like a missing id.
      const programCity = await programCityOf(target)
      return programCity !== undefined && (programCity === null || programCity === session.user.city)
    }
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

  if (target.scope === 'LESSON') {
    const lesson = await db.lesson.findUnique({
      where: { id: target.lessonId },
      select: { courseId: true },
    })
    if (!lesson) return false
    const assigned = await db.teacherAssignment.findFirst({
      where: { userId, scheduledGroup: { courseId: lesson.courseId } },
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

/** The owning program's city (null = shared), or undefined when the target is gone. */
async function programCityOf(
  target: Exclude<CanManageTarget, { scope: 'GROUP' }>,
): Promise<City | null | undefined> {
  if (target.scope === 'LESSON') {
    const lesson = await db.lesson.findUnique({
      where: { id: target.lessonId },
      select: { course: { select: { city: true } } },
    })
    return lesson ? lesson.course.city : undefined
  }
  if (target.scope === 'MODULE') {
    const mod = await db.courseModule.findUnique({
      where: { id: target.moduleId },
      select: { course: { select: { city: true } } },
    })
    return mod ? mod.course.city : undefined
  }
  const course = await db.course.findUnique({ where: { id: target.courseId }, select: { city: true } })
  return course ? course.city : undefined
}

export function materialTarget(m: {
  scope: 'LESSON' | 'MODULE' | 'COURSE' | 'GROUP'
  moduleId: string | null
  courseId: string | null
  scheduledGroupId: string | null
  lessonId: string | null
}): CanManageTarget | null {
  if (m.scope === 'LESSON' && m.lessonId) return { scope: 'LESSON', lessonId: m.lessonId }
  if (m.scope === 'MODULE' && m.moduleId) return { scope: 'MODULE', moduleId: m.moduleId }
  if (m.scope === 'COURSE' && m.courseId) return { scope: 'COURSE', courseId: m.courseId }
  if (m.scope === 'GROUP' && m.scheduledGroupId)
    return { scope: 'GROUP', scheduledGroupId: m.scheduledGroupId }
  return null
}
