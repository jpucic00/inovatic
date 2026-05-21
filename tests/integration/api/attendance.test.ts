import { describe, expect, it, vi } from 'vitest'
import { mockSession } from '../setup'
import {
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

// getGroupAttendance roster scoping — migrated from the C5 case ("attendance
// roster only includes own-group students") removed from
// tests/phase3/25-attendance.spec.ts. assertTeacherOwnsGroup calls notFound()
// for non-owners, so mock next/navigation to make it a catchable throw.
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

const { getGroupAttendance } = await import('@/actions/teacher/attendance')

describe('getGroupAttendance — roster scoping', () => {
  it("roster contains only the queried group's enrolled students", async () => {
    const teacher = await createTeacher()
    const groupA = await createGroup()
    const groupB = await createGroup()
    await createTeacherAssignment(teacher.id, groupA.id)

    const studentA = await createStudent()
    const studentB = await createStudent()
    await createEnrollment(studentA.id, groupA.id, { schoolYear: groupA.schoolYear })
    await createEnrollment(studentB.id, groupB.id, { schoolYear: groupB.schoolYear })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await getGroupAttendance(groupA.id)

    const rosterIds = result.roster.map((r) => r.studentId)
    expect(rosterIds, "group A's student is on the roster").toContain(studentA.id)
    expect(
      rosterIds,
      "group B's student does NOT leak into group A's roster",
    ).not.toContain(studentB.id)
  })

  it('roster excludes an enrollment from a different school year', async () => {
    const teacher = await createTeacher()
    const group = await createGroup({ schoolYear: '2026/2027' })
    await createTeacherAssignment(teacher.id, group.id)

    const current = await createStudent()
    const pastYear = await createStudent()
    await createEnrollment(current.id, group.id, { schoolYear: '2026/2027' })
    await createEnrollment(pastYear.id, group.id, { schoolYear: '2025/2026' })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await getGroupAttendance(group.id)

    const rosterIds = result.roster.map((r) => r.studentId)
    expect(rosterIds).toContain(current.id)
    expect(
      rosterIds,
      'a prior-year enrollment in the same group is excluded',
    ).not.toContain(pastYear.id)
  })

  it('throws NEXT_NOT_FOUND when the teacher is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(getGroupAttendance(group.id)).rejects.toThrow(/NEXT_NOT_FOUND/)
  })
})
