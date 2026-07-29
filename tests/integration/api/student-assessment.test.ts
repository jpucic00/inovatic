import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from '../setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { upsertAssessment, clearAssessment } = await import(
  '@/actions/admin/student-assessment'
)
const { upsertTeacherAssessment, clearTeacherAssessment } = await import(
  '@/actions/teacher/student-assessment'
)

let courseCounter = 0
async function createStandardCourseWithLevel() {
  courseCounter++
  return db.course.create({
    data: {
      slug: `slr-lvl-${Date.now().toString(36)}-${courseCounter}`,
      title: 'SLR 2',
      description: 'Standardni program',
      ageMin: 6,
      ageMax: 14,
      kind: 'STANDARD',
      level: 'SLR_2',
    },
  })
}

describe('upsertAssessment / clearAssessment — admin', () => {
  it('creates then updates a single (student, group) report card', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const group = await createGroup({ city: 'SPLIT' })
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })

    const created = await upsertAssessment({
      studentId: student.id,
      groupId: group.id,
      slaganje: 'POCETNO',
      opisnaOcjena: 'Prvi dojam',
    })
    expect(created.success).toBe(true)

    const updated = await upsertAssessment({
      studentId: student.id,
      groupId: group.id,
      slaganje: 'OSTVARENO',
      zabava: 'U_RAZVOJU',
    })
    expect(updated.success).toBe(true)

    const rows = await db.studentAssessment.findMany({
      where: { studentId: student.id, groupId: group.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].slaganje).toBe('OSTVARENO')
    expect(rows[0].zabava).toBe('U_RAZVOJU')
    expect(rows[0].authorId).toBe(admin.id)
  })

  it('stores a valid COURSE recommendation', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const group = await createGroup({ city: 'SPLIT' })
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    const slr2 = await createStandardCourseWithLevel()

    const res = await upsertAssessment({
      studentId: student.id,
      groupId: group.id,
      recommendationKind: 'COURSE',
      recommendedCourseId: slr2.id,
    })
    expect(res.success).toBe(true)

    const row = await db.studentAssessment.findFirstOrThrow({
      where: { studentId: student.id, groupId: group.id },
    })
    expect(row.recommendationKind).toBe('COURSE')
    expect(row.recommendedCourseId).toBe(slr2.id)
  })

  it('rejects a COURSE recommendation that points at a radionica course', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const group = await createGroup({ city: 'SPLIT' })
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    const radionica = await createCourse({ kind: 'RADIONICA' })

    const res = await upsertAssessment({
      studentId: student.id,
      groupId: group.id,
      recommendationKind: 'COURSE',
      recommendedCourseId: radionica.id,
    })
    expect(res.success).toBe(false)
    expect(
      await db.studentAssessment.findMany({
        where: { studentId: student.id, groupId: group.id },
      }),
    ).toHaveLength(0)
  })

  it('refuses to grade a radionica group', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const radionicaCourse = await createCourse({ kind: 'RADIONICA' })
    const group = await createGroup({ city: 'SPLIT', courseId: radionicaCourse.id })
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })

    const res = await upsertAssessment({
      studentId: student.id,
      groupId: group.id,
      slaganje: 'OSTVARENO',
    })
    expect(res.success).toBe(false)
    expect(
      await db.studentAssessment.findMany({ where: { groupId: group.id } }),
    ).toHaveLength(0)
  })

  it('rejects grading a student who is not enrolled in the group', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const group = await createGroup({ city: 'SPLIT' })

    const res = await upsertAssessment({
      studentId: student.id,
      groupId: group.id,
      slaganje: 'OSTVARENO',
    })
    expect(res).toEqual({
      success: false,
      error: 'Učenik nije upisan u ovu grupu.',
    })
    expect(
      await db.studentAssessment.findMany({ where: { groupId: group.id } }),
    ).toHaveLength(0)
  })

  it('rejects grading a cross-city group (404)', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const splitGroup = await createGroup({ city: 'SPLIT' })

    await expect(
      upsertAssessment({ studentId: splitStudent.id, groupId: splitGroup.id }),
    ).rejects.toThrow()
    expect(
      await db.studentAssessment.findMany({ where: { groupId: splitGroup.id } }),
    ).toHaveLength(0)
  })

  it('rejects grading a cross-city student via an own-city group (404)', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })

    await expect(
      upsertAssessment({ studentId: splitStudent.id, groupId: sibenikGroup.id }),
    ).rejects.toThrow()
  })

  it('clears a same-city card and rejects a cross-city clear', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    const student = await createStudent({ city: 'SPLIT' })
    const group = await createGroup({ city: 'SPLIT' })
    await db.studentAssessment.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        authorId: splitAdmin.id,
        slaganje: 'OSTVARENO',
      },
    })

    // Cross-city admin can't clear it.
    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })
    await expect(
      clearAssessment({ studentId: student.id, groupId: group.id }),
    ).rejects.toThrow()
    expect(
      await db.studentAssessment.findMany({ where: { groupId: group.id } }),
    ).toHaveLength(1)

    // Own-city admin can.
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })
    const cleared = await clearAssessment({ studentId: student.id, groupId: group.id })
    expect(cleared.success).toBe(true)
    expect(
      await db.studentAssessment.findMany({ where: { groupId: group.id } }),
    ).toHaveLength(0)
  })
})

describe('upsertTeacherAssessment / clearTeacherAssessment — teacher', () => {
  it('lets an assigned teacher grade an enrolled student', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await upsertTeacherAssessment({
      studentId: student.id,
      groupId: group.id,
      komunikacija: 'OSTVARENO',
    })
    expect(res.success).toBe(true)
    const row = await db.studentAssessment.findFirstOrThrow({
      where: { studentId: student.id, groupId: group.id },
    })
    expect(row.komunikacija).toBe('OSTVARENO')
    expect(row.authorId).toBe(teacher.id)
  })

  it('rejects a teacher grading a group they are not assigned to (404)', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(
      upsertTeacherAssessment({ studentId: student.id, groupId: group.id }),
    ).rejects.toThrow()
    expect(
      await db.studentAssessment.findMany({ where: { groupId: group.id } }),
    ).toHaveLength(0)
  })

  it('rejects an assigned teacher grading a student enrolled only in a different group (404)', async () => {
    const teacher = await createTeacher()
    const groupA = await createGroup()
    const groupB = await createGroup()
    const student = await createStudent()
    await createEnrollment(student.id, groupB.id, { schoolYear: groupB.schoolYear })
    await createTeacherAssignment(teacher.id, groupA.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(
      upsertTeacherAssessment({ studentId: student.id, groupId: groupA.id }),
    ).rejects.toThrow()
    expect(
      await db.studentAssessment.findMany({ where: { groupId: groupA.id } }),
    ).toHaveLength(0)
  })

  it('is tenant-bound for the admin pass-through (cross-city admin 404s)', async () => {
    const student = await createStudent({ city: 'SIBENIK' })
    const group = await createGroup({ city: 'SIBENIK' })
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })

    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })

    await expect(
      upsertTeacherAssessment({ studentId: student.id, groupId: group.id }),
    ).rejects.toThrow()
  })

  it('clears a card the teacher owns', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    const student = await createStudent()
    await createEnrollment(student.id, group.id, { schoolYear: group.schoolYear })
    await createTeacherAssignment(teacher.id, group.id)
    await db.studentAssessment.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        authorId: teacher.id,
        zabava: 'OSTVARENO',
      },
    })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await clearTeacherAssessment({
      studentId: student.id,
      groupId: group.id,
    })
    expect(res.success).toBe(true)
    expect(
      await db.studentAssessment.findMany({ where: { groupId: group.id } }),
    ).toHaveLength(0)
  })
})
