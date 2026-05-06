import { notFound } from 'next/navigation'
import type { Session } from 'next-auth'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'

/**
 * Gates access to a ScheduledGroup-scoped teacher resource.
 *
 * TEACHER users may access only groups they have a TeacherAssignment for.
 * ADMIN users may access any group (needed for support + cross-role testing).
 * If the group doesn't exist OR the teacher lacks an assignment → notFound().
 *
 * Returns the session + minimal group fields so callers don't re-fetch them.
 */
export async function assertTeacherOwnsGroup(groupId: string): Promise<{
  session: Session
  isAdmin: boolean
}> {
  const session = await requireTeacher()
  const isAdmin = session.user.role === 'ADMIN'

  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  })
  if (!group) notFound()

  if (!isAdmin) {
    const assignment = await db.teacherAssignment.findUnique({
      where: {
        userId_scheduledGroupId: {
          userId: session.user.id,
          scheduledGroupId: groupId,
        },
      },
      select: { id: true },
    })
    if (!assignment) notFound()
  }

  return { session, isAdmin }
}

/**
 * Gates teacher access to a student's full profile. TEACHER may view any
 * student they share at least one ScheduledGroup with (current OR past
 * enrollment). ADMIN may view any student. Used by the unified student detail
 * page that admins and teachers render.
 */
export async function assertTeacherCanViewStudent(studentId: string): Promise<{
  session: Session
  isAdmin: boolean
}> {
  const session = await requireTeacher()
  const isAdmin = session.user.role === 'ADMIN'

  const student = await db.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    select: { id: true },
  })
  if (!student) notFound()

  if (!isAdmin) {
    const shared = await db.enrollment.findFirst({
      where: {
        userId: studentId,
        scheduledGroup: {
          teacherAssignments: { some: { userId: session.user.id } },
        },
      },
      select: { id: true },
    })
    if (!shared) notFound()
  }

  return { session, isAdmin }
}

/**
 * Asserts a student has (or had) an Enrollment in the given group. Used to
 * gate per-student deep views and to reject spoofed studentIds in comment
 * mutations the teacher initiates on behalf of a roster member.
 */
export async function assertStudentInGroup(
  studentId: string,
  groupId: string,
): Promise<void> {
  const enrollment = await db.enrollment.findFirst({
    where: { userId: studentId, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()
}

/**
 * True when the caller may delete the given comment. ADMIN can delete any
 * comment; TEACHER can delete only their own. Returning false means the UI
 * should hide the delete affordance AND server actions should reject.
 */
export function canDeleteComment(
  session: Session,
  comment: { authorId: string },
): boolean {
  if (session.user.role === 'ADMIN') return true
  return session.user.id === comment.authorId
}
