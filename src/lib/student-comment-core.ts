import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function insertStudentComment(
  data: {
    studentId: string
    groupId: string
    content: string
  },
  authorId: string,
): Promise<void> {
  await db.studentComment.create({
    data: {
      studentId: data.studentId,
      groupId: data.groupId,
      authorId,
      content: data.content,
    },
  })

  revalidatePath(`/admin/ucenici/${data.studentId}`)
  revalidatePath(`/nastavnik/ucenik/${data.studentId}`)
  revalidatePath(`/nastavnik/grupa/${data.groupId}`)
}
