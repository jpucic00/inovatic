import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { zagrebDateKey } from '@/lib/attendance-window'
import { mockSession } from '../setup'
import {
  createAdmin,
  createAttendance,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

// Integration coverage for the attendance server actions — getGroupAttendance +
// bulkMarkSession (src/actions/teacher/attendance.ts) and getStudentAttendance
// (src/actions/admin/attendance.ts). The teacher/admin guards call
// notFound()/redirect() and bulkMarkSession calls revalidatePath() on success,
// so mock next/navigation (catchable NEXT_NOT_FOUND / NEXT_REDIRECT throws) and
// next/cache (revalidatePath is a no-op outside a request scope).
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

const { bulkMarkSession, getGroupAttendance } = await import('@/actions/teacher/attendance')
const { getStudentAttendance } = await import('@/actions/admin/attendance')

// Teachers may only mark the current month up to today, so these fixtures use
// today rather than a hardcoded date that would age out of the window.
const MARK_DATE = zagrebDateKey(new Date())

// Roster scoping — migrated from the C5 case ("attendance roster only includes
// own-group students") removed from tests/phase3/25-attendance.spec.ts.
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

describe('bulkMarkSession — session marking', () => {
  it('creates an Attendance row for every entry in the roster', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)

    const studentA = await createStudent()
    const studentB = await createStudent()
    const enrollmentA = await createEnrollment(studentA.id, group.id, {
      schoolYear: group.schoolYear,
    })
    const enrollmentB = await createEnrollment(studentB.id, group.id, {
      schoolYear: group.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MARK_DATE,
      entries: [
        { enrollmentId: enrollmentA.id, present: true },
        { enrollmentId: enrollmentB.id, present: false, note: 'Bolestan' },
      ],
    })
    expect(result.success).toBe(true)

    const rowA = await db.attendance.findFirst({ where: { enrollmentId: enrollmentA.id } })
    const rowB = await db.attendance.findFirst({ where: { enrollmentId: enrollmentB.id } })
    expect(rowA).toMatchObject({ present: true, recordedById: teacher.id })
    expect(rowB).toMatchObject({ present: false, note: 'Bolestan', recordedById: teacher.id })
  })

  it('upserts in place when the same session is re-marked (no duplicate row)', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, {
      schoolYear: group.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const first = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MARK_DATE,
      entries: [{ enrollmentId: enrollment.id, present: true }],
    })
    expect(first.success).toBe(true)

    const second = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MARK_DATE,
      entries: [{ enrollmentId: enrollment.id, present: false, note: 'Stigao kasno' }],
    })
    expect(second.success).toBe(true)

    const rows = await db.attendance.findMany({ where: { enrollmentId: enrollment.id } })
    expect(rows, 're-marking the same date updates the row in place').toHaveLength(1)
    expect(rows[0]).toMatchObject({ present: false, note: 'Stigao kasno' })
  })

  it('rejects entries whose enrollment belongs to another group', async () => {
    const teacher = await createTeacher()
    const ownGroup = await createGroup()
    await createTeacherAssignment(teacher.id, ownGroup.id)

    const otherGroup = await createGroup()
    const outsider = await createStudent()
    const foreignEnrollment = await createEnrollment(outsider.id, otherGroup.id, {
      schoolYear: otherGroup.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await bulkMarkSession({
      groupId: ownGroup.id,
      sessionDate: MARK_DATE,
      entries: [{ enrollmentId: foreignEnrollment.id, present: true }],
    })

    expect(result).toEqual({
      success: false,
      error: 'Neki upisi ne pripadaju ovoj grupi ili školskoj godini.',
    })
    const written = await db.attendance.count({ where: { enrollmentId: foreignEnrollment.id } })
    expect(written, 'the rejected session writes no attendance rows').toBe(0)
  })

  it('throws NEXT_NOT_FOUND when the teacher is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, {
      schoolYear: group.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(
      bulkMarkSession({
        groupId: group.id,
        sessionDate: MARK_DATE,
        entries: [{ enrollmentId: enrollment.id, present: true }],
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })
})

describe('getStudentAttendance — admin query', () => {
  it('aggregates present/absent counts per enrollment', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    const student = await createStudent()

    const groupA = await createGroup()
    const groupB = await createGroup()
    const enrollmentA = await createEnrollment(student.id, groupA.id, {
      schoolYear: groupA.schoolYear,
    })
    const enrollmentB = await createEnrollment(student.id, groupB.id, {
      schoolYear: groupB.schoolYear,
    })

    await createAttendance(enrollmentA.id, teacher.id, {
      sessionDate: new Date('2026-03-02'),
      present: true,
    })
    await createAttendance(enrollmentA.id, teacher.id, {
      sessionDate: new Date('2026-03-09'),
      present: true,
    })
    await createAttendance(enrollmentA.id, teacher.id, {
      sessionDate: new Date('2026-03-16'),
      present: false,
    })
    await createAttendance(enrollmentB.id, teacher.id, {
      sessionDate: new Date('2026-03-03'),
      present: true,
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const result = await getStudentAttendance(student.id)

    expect(result).toHaveLength(2)
    const a = result.find((e) => e.groupId === groupA.id)
    const b = result.find((e) => e.groupId === groupB.id)
    expect(a?.presentCount).toBe(2)
    expect(a?.absentCount).toBe(1)
    expect(a?.rows).toHaveLength(3)
    expect(b?.presentCount).toBe(1)
    expect(b?.absentCount).toBe(0)
    expect(b?.rows).toHaveLength(1)
  })

  it("excludes other students' enrollments and attendance", async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()

    const target = await createStudent()
    const other = await createStudent()
    const targetGroup = await createGroup()
    const otherGroup = await createGroup()
    const targetEnrollment = await createEnrollment(target.id, targetGroup.id, {
      schoolYear: targetGroup.schoolYear,
    })
    const otherEnrollment = await createEnrollment(other.id, otherGroup.id, {
      schoolYear: otherGroup.schoolYear,
    })

    await createAttendance(targetEnrollment.id, teacher.id, {
      sessionDate: new Date('2026-03-02'),
    })
    await createAttendance(otherEnrollment.id, teacher.id, {
      sessionDate: new Date('2026-03-02'),
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const result = await getStudentAttendance(target.id)

    expect(result).toHaveLength(1)
    expect(result[0].enrollmentId).toBe(targetEnrollment.id)
    expect(
      result.some((e) => e.enrollmentId === otherEnrollment.id),
      "another student's enrollment must not leak into the result",
    ).toBe(false)
  })

  it('throws NEXT_REDIRECT for a non-admin caller', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()

    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(getStudentAttendance(student.id)).rejects.toThrow(/NEXT_REDIRECT/)
  })
})
