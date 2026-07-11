import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from '../setup'
import {
  createAdmin,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

// Server-action authz for createTeacherComment / deleteTeacherComment —
// migrated from the "Server-action authz (direct POST)" block deleted from
// tests/phase3/28-access-control.spec.ts. The Playwright original forged
// Next-Action POSTs; invoking the actions directly with a mocked session
// pins the same authz contract at the integration tier.
//
// Both actions reach next/navigation (notFound, via the teacher guards) and
// next/cache (revalidatePath, on the success path) — mock both so the guards
// throw a catchable NEXT_NOT_FOUND and revalidatePath is a no-op outside a
// request scope.
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { createTeacherComment, deleteTeacherComment } = await import(
  '@/actions/teacher/student-comment'
)

describe('createTeacherComment — server-action authz', () => {
  it('throws NEXT_NOT_FOUND when the teacher is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(
      createTeacherComment({ groupId: group.id, studentId: student.id, content: 'Spoof' }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('throws NEXT_NOT_FOUND when the student has no enrollment in the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    const outsider = await createStudent()
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(
      createTeacherComment({ groupId: group.id, studentId: outsider.id, content: 'Spoof' }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('persists the comment for a teacher assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await createTeacherComment({
      groupId: group.id,
      studentId: student.id,
      content: 'Dobar napredak ovaj tjedan.',
    })
    expect(res.success).toBe(true)

    const row = await db.studentComment.findFirst({
      where: { groupId: group.id, studentId: student.id, authorId: teacher.id },
      select: { content: true },
    })
    expect(row?.content).toBe('Dobar napredak ovaj tjedan.')
  })
})

describe('deleteTeacherComment — server-action authz', () => {
  async function seedComment(authorId: string): Promise<string> {
    const group = await createGroup()
    const student = await createStudent()
    const comment = await db.studentComment.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        authorId,
        content: 'Bilješka',
      },
      select: { id: true },
    })
    return comment.id
  }

  it("rejects a teacher deleting another teacher's comment", async () => {
    const teacherA = await createTeacher()
    const teacherB = await createTeacher()
    const commentId = await seedComment(teacherA.id)
    mockSession({ id: teacherB.id, role: 'TEACHER' })

    const res = await deleteTeacherComment(commentId)
    expect(res.success).toBe(false)

    const stillThere = await db.studentComment.findUnique({ where: { id: commentId } })
    expect(stillThere, "another teacher's comment is left untouched").not.toBeNull()
  })

  it('lets a teacher delete their own comment', async () => {
    const teacher = await createTeacher()
    const commentId = await seedComment(teacher.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await deleteTeacherComment(commentId)
    expect(res.success).toBe(true)
    expect(await db.studentComment.findUnique({ where: { id: commentId } })).toBeNull()
  })

  it("lets an ADMIN delete any teacher's comment", async () => {
    const teacher = await createTeacher()
    const admin = await createAdmin()
    const commentId = await seedComment(teacher.id)
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await deleteTeacherComment(commentId)
    expect(res.success).toBe(true)
    expect(await db.studentComment.findUnique({ where: { id: commentId } })).toBeNull()
  })

  it('returns { success: false } when the comment does not exist', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await deleteTeacherComment('comment-does-not-exist')
    expect(res.success).toBe(false)
  })
})
