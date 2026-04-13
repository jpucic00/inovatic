'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import { createCommentSchema } from '@/lib/validators/admin/student-comment'

export async function getComments(studentId: string, groupId?: string) {
  await requireAdmin()

  return db.studentComment.findMany({
    where: {
      studentId,
      ...(groupId ? { groupId } : {}),
    },
    include: {
      author: { select: { firstName: true, lastName: true } },
      module: { select: { id: true, title: true } },
      group: {
        select: {
          id: true,
          name: true,
          course: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createComment(data: {
  studentId: string
  groupId: string
  content: string
  type?: 'COMMENT' | 'MODULE_REVIEW'
  moduleId?: string
}): Promise<AdminActionResult> {
  const session = await requireAdmin()

  const parsed = createCommentSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  try {
    const authorId = session.user.id
    if (!authorId) return { success: false, error: 'Neautorizirano.' }

    await db.studentComment.create({
      data: {
        studentId: parsed.data.studentId,
        groupId: parsed.data.groupId,
        authorId,
        content: parsed.data.content,
        type: parsed.data.type ?? 'COMMENT',
        moduleId: parsed.data.moduleId || null,
      },
    })

    revalidatePath(`/admin/ucenici/${parsed.data.studentId}`)
    return { success: true }
  } catch (err) {
    console.error('createComment failed:', err)
    return { success: false, error: 'Greška pri dodavanju komentara.' }
  }
}

export async function deleteComment(commentId: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!commentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const comment = await db.studentComment.findUnique({
      where: { id: commentId },
    })
    if (!comment) return { success: false, error: 'Komentar nije pronađen.' }

    await db.studentComment.delete({ where: { id: commentId } })

    revalidatePath(`/admin/ucenici/${comment.studentId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteComment failed:', err)
    return { success: false, error: 'Greška pri brisanju komentara.' }
  }
}
