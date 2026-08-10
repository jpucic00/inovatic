/**
 * `getStudentGroupContext` resolves the `?grupa=` a teacher opened a student
 * from into the back-link target. It is the one thing standing between a
 * hand-edited query param and either a 404 on the student page or a back link
 * that 404s on click — so every rejection path is asserted to return null
 * rather than throw.
 */
import { describe, expect, it, vi } from 'vitest'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

const { getStudentGroupContext } = await import('@/actions/teacher/student')

describe('getStudentGroupContext — TEACHER', () => {
  it('resolves a group the teacher is assigned to and the student is enrolled in', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const group = await createGroup({ name: 'SLR 2 – ponedjeljak' })
    await createTeacherAssignment(teacher.id, group.id)
    await createEnrollment(student.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    expect(await getStudentGroupContext(student.id, group.id)).toEqual({
      id: group.id,
      name: 'SLR 2 – ponedjeljak',
    })
  })

  it('returns null for a colleague’s group — the back link must never 404 on click', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const own = await createGroup()
    const colleagues = await createGroup()
    await createTeacherAssignment(teacher.id, own.id)
    await createEnrollment(student.id, own.id)
    await createEnrollment(student.id, colleagues.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    expect(await getStudentGroupContext(student.id, colleagues.id)).toBeNull()
  })

  it('returns null when the student is not enrolled in the teacher’s own group', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const shared = await createGroup()
    const other = await createGroup()
    await createTeacherAssignment(teacher.id, shared.id)
    await createTeacherAssignment(teacher.id, other.id)
    await createEnrollment(student.id, shared.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    expect(await getStudentGroupContext(student.id, other.id)).toBeNull()
  })

  it('returns null for a nonexistent group id instead of 404-ing the page', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    await createEnrollment(student.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    expect(await getStudentGroupContext(student.id, 'nepostojeci-id')).toBeNull()
  })
})

describe('getStudentGroupContext — ADMIN pass-through is tenant-bound', () => {
  it('resolves a same-city group without any TeacherAssignment', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const student = await createStudent({ city: 'SIBENIK' })
    const group = await createGroup({ city: 'SIBENIK' })
    await createEnrollment(student.id, group.id)
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    expect(await getStudentGroupContext(student.id, group.id)).toEqual({
      id: group.id,
      name: group.name,
    })
  })

  it('returns null for a cross-city group', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const student = await createStudent({ city: 'SIBENIK' })
    const sibenik = await createGroup({ city: 'SIBENIK' })
    const split = await createGroup({ city: 'SPLIT' })
    await createEnrollment(student.id, sibenik.id)
    await createEnrollment(student.id, split.id)
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    expect(await getStudentGroupContext(student.id, split.id)).toBeNull()
  })
})
