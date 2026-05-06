'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import {
  assertStudentInGroup,
  assertTeacherOwnsGroup,
  canDeleteComment,
} from '@/lib/teacher-guard'
import { createCommentSchema } from '@/lib/validators/admin/student-comment'
import type { AdminActionResult } from '@/lib/action-types'

export async function createTeacherComment(input: {
  groupId: string
  studentId: string
  content: string
  type?: 'COMMENT' | 'MODULE_REVIEW'
  moduleId?: string
}): Promise<AdminActionResult> {
  const parsed = createCommentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { session } = await assertTeacherOwnsGroup(parsed.data.groupId)
  await assertStudentInGroup(parsed.data.studentId, parsed.data.groupId)

  try {
    await db.studentComment.create({
      data: {
        studentId: parsed.data.studentId,
        groupId: parsed.data.groupId,
        authorId: session.user.id,
        content: parsed.data.content,
        type: parsed.data.type ?? 'COMMENT',
        moduleId: parsed.data.moduleId || null,
      },
    })

    revalidatePath(`/nastavnik/grupa/${parsed.data.groupId}`)
    revalidatePath(`/nastavnik/ucenik/${parsed.data.studentId}`)
    revalidatePath(`/admin/ucenici/${parsed.data.studentId}`)
    return { success: true }
  } catch (err) {
    console.error('createTeacherComment failed:', err)
    return { success: false, error: 'Greška pri dodavanju komentara.' }
  }
}

export async function deleteTeacherComment(
  commentId: string,
): Promise<AdminActionResult> {
  if (!commentId) return { success: false, error: 'ID nije pronađen.' }
  const session = await requireTeacher()

  try {
    const comment = await db.studentComment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, studentId: true, groupId: true },
    })
    if (!comment) return { success: false, error: 'Komentar nije pronađen.' }

    if (!canDeleteComment(session, comment)) {
      return { success: false, error: 'Nemate dopuštenje za brisanje.' }
    }

    await db.studentComment.delete({ where: { id: commentId } })

    revalidatePath(`/nastavnik/grupa/${comment.groupId}`)
    revalidatePath(`/nastavnik/ucenik/${comment.studentId}`)
    revalidatePath(`/admin/ucenici/${comment.studentId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteTeacherComment failed:', err)
    return { success: false, error: 'Greška pri brisanju komentara.' }
  }
}

