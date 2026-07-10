'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertGroupInCity, assertUserInCity } from '@/lib/city-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import { createCommentSchema } from '@/lib/validators/admin/student-comment'
import { insertStudentComment } from '@/lib/student-comment-core'

export async function createComment(data: {
  studentId: string
  groupId: string
  content: string
  type?: 'COMMENT' | 'MODULE_REVIEW'
  moduleId?: string
}): Promise<AdminActionResult> {
  const { session, city } = await requireAdminCtx()

  const parsed = createCommentSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const authorId = session.user.id
  if (!authorId) return { success: false, error: 'Neautorizirano.' }

  // Cross-city targets 404 like nonexistent ids — city comes from the session only.
  await assertGroupInCity(parsed.data.groupId, city)
  await assertUserInCity(parsed.data.studentId, city)

  try {
    await insertStudentComment(
      {
        studentId: parsed.data.studentId,
        groupId: parsed.data.groupId,
        content: parsed.data.content,
        type: parsed.data.type ?? 'COMMENT',
        moduleId: parsed.data.moduleId ?? null,
      },
      authorId,
    )
    return { success: true }
  } catch (err) {
    console.error('createComment failed:', err)
    return { success: false, error: 'Greška pri dodavanju komentara.' }
  }
}

export async function deleteComment(commentId: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!commentId) return { success: false, error: 'ID nije pronađen.' }

  const comment = await db.studentComment.findUnique({
    where: { id: commentId },
    select: { studentId: true, groupId: true },
  })
  if (!comment) return { success: false, error: 'Komentar nije pronađen.' }

  // Outside the try so the cross-city notFound() isn't swallowed by the catch.
  await assertGroupInCity(comment.groupId, city)

  try {
    await db.studentComment.delete({ where: { id: commentId } })

    revalidatePath(`/admin/ucenici/${comment.studentId}`)
    revalidatePath(`/nastavnik/ucenik/${comment.studentId}`)
    revalidatePath(`/nastavnik/grupa/${comment.groupId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteComment failed:', err)
    return { success: false, error: 'Greška pri brisanju komentara.' }
  }
}
