import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createGroup, createStudent } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { createComment, deleteComment } = await import('@/actions/admin/student-comment')

// PR3 tenant scoping for admin student comments: a Šibenik admin must see
// Split students/groups/comments as nonexistent (404 via notFound()), while
// same-city create + delete keep working.
describe('city scoping — admin student comments', () => {
  it('rejects creating a comment on a cross-city group (404)', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const splitStudent = await createStudent({ city: 'SPLIT' })
    const splitGroup = await createGroup({ city: 'SPLIT' })

    await expect(
      createComment({
        studentId: splitStudent.id,
        groupId: splitGroup.id,
        content: 'Cross-city pokušaj',
      }),
    ).rejects.toThrow()

    const rows = await db.studentComment.findMany({
      where: { studentId: splitStudent.id, groupId: splitGroup.id },
    })
    expect(rows).toHaveLength(0)
  })

  it('rejects creating a comment on a cross-city student even via an own-city group (404)', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const splitStudent = await createStudent({ city: 'SPLIT' })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })

    await expect(
      createComment({
        studentId: splitStudent.id,
        groupId: sibenikGroup.id,
        content: 'Cross-city pokušaj',
      }),
    ).rejects.toThrow()

    const rows = await db.studentComment.findMany({
      where: { studentId: splitStudent.id, groupId: sibenikGroup.id },
    })
    expect(rows).toHaveLength(0)
  })

  it('rejects deleting a cross-city comment (404) and leaves the row intact', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const splitGroup = await createGroup({ city: 'SPLIT' })
    const comment = await db.studentComment.create({
      data: {
        studentId: splitStudent.id,
        groupId: splitGroup.id,
        authorId: splitAdmin.id,
        content: 'Splitski komentar',
      },
    })

    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(deleteComment(comment.id)).rejects.toThrow()

    const still = await db.studentComment.findUnique({ where: { id: comment.id } })
    expect(still).not.toBeNull()
  })

  it('creates and deletes a same-city comment', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const student = await createStudent({ city: 'SIBENIK' })
    const group = await createGroup({ city: 'SIBENIK' })

    const created = await createComment({
      studentId: student.id,
      groupId: group.id,
      content: 'Šibenski komentar',
    })
    expect(created.success).toBe(true)

    const row = await db.studentComment.findFirst({
      where: { studentId: student.id, groupId: group.id, content: 'Šibenski komentar' },
    })
    expect(row).not.toBeNull()

    const deleted = await deleteComment(row!.id)
    expect(deleted.success).toBe(true)
    expect(await db.studentComment.findUnique({ where: { id: row!.id } })).toBeNull()
  })
})
