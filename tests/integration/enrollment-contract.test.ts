import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear, getPreviousSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { setEnrollmentContractSigned } = await import('@/actions/admin/payment')
const { setEnrollmentContractSignedByTeacher } = await import('@/actions/teacher/contract')

const CY = computeSchoolYear()
const PY = getPreviousSchoolYear(CY)

async function contractSignedAt(enrollmentId: string): Promise<Date | null> {
  const row = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { contractSignedAt: true },
  })
  return row?.contractSignedAt ?? null
}

/** Student + group + enrollment in one city, plus the enrollment id. */
async function seedEnrollment(city: 'SPLIT' | 'SIBENIK' = 'SPLIT', schoolYear: string = CY) {
  const student = await createStudent({ city })
  const course = await createCourse()
  const group = await createGroup({ courseId: course.id, city, schoolYear })
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear })
  return { student, course, group, enrollment }
}

describe('setEnrollmentContractSigned (admin)', () => {
  it('marks a contract signed and then unsigned', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment('SPLIT')
    expect(await contractSignedAt(enrollment.id)).toBeNull()

    const res = await setEnrollmentContractSigned(enrollment.id, true)
    expect(res.success).toBe(true)
    expect(await contractSignedAt(enrollment.id)).not.toBeNull()

    const res2 = await setEnrollmentContractSigned(enrollment.id, false)
    expect(res2.success).toBe(true)
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  it('refuses a cross-city enrollment, and leaves it untouched', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })

    const { enrollment } = await seedEnrollment('SIBENIK')

    const res = await setEnrollmentContractSigned(enrollment.id, true)
    expect(res.success).toBe(false)
    // Answers exactly like a nonexistent id — the tenancy rule.
    if (!res.success) expect(res.error).toBe('Upis nije pronađen.')
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  it('returns failure for an unknown enrollment id', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await setEnrollmentContractSigned('does-not-exist', true)
    expect(res.success).toBe(false)
  })

  it('rejects an anonymous caller', async () => {
    mockSession(null)
    await expect(setEnrollmentContractSigned('whatever', true)).rejects.toThrow()
  })
})

describe('setEnrollmentContractSignedByTeacher', () => {
  it('lets an assigned teacher sign for their own group', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })
    const { group, enrollment } = await seedEnrollment('SPLIT')
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    const res = await setEnrollmentContractSignedByTeacher(enrollment.id, true)
    expect(res.success).toBe(true)
    expect(await contractSignedAt(enrollment.id)).not.toBeNull()

    const res2 = await setEnrollmentContractSignedByTeacher(enrollment.id, false)
    expect(res2.success).toBe(true)
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  /**
   * A past year's contracts are settled, so marking one is a correction — and
   * corrections are the admin's job everywhere else here (same split
   * `teacherMarkingWindow` draws for attendance). The teacher OWNS this group;
   * only the year refuses, which is what separates this from the guard below.
   */
  it('refuses an own group in a previous school year, and says why', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })
    const { group, enrollment } = await seedEnrollment('SPLIT', PY)
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    const res = await setEnrollmentContractSignedByTeacher(enrollment.id, true)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/tekuću školsku godinu/)
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  /** The admin is the correction path, so the year rule does not apply to them. */
  it('lets an admin mark a previous school year through the teacher path', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const { enrollment } = await seedEnrollment('SPLIT', PY)
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await setEnrollmentContractSignedByTeacher(enrollment.id, true)
    expect(res.success).toBe(true)
    expect(await contractSignedAt(enrollment.id)).not.toBeNull()
  })

  it("rejects a teacher who is not assigned to the enrollment's group", async () => {
    const outsider = await createTeacher({ city: 'SPLIT' })
    const { enrollment } = await seedEnrollment('SPLIT')
    mockSession({ id: outsider.id, role: 'TEACHER', city: 'SPLIT' })

    // assertTeacherOwnsGroup throws notFound() rather than returning a result.
    await expect(
      setEnrollmentContractSignedByTeacher(enrollment.id, true),
    ).rejects.toThrow()
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  it('rejects an admin reaching into the other city through the teacher path', async () => {
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    const { enrollment } = await seedEnrollment('SIBENIK')
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })

    await expect(
      setEnrollmentContractSignedByTeacher(enrollment.id, true),
    ).rejects.toThrow()
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  it('lets a same-city admin use the teacher path (teaching-admin pass-through)', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const { enrollment } = await seedEnrollment('SIBENIK')
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const res = await setEnrollmentContractSignedByTeacher(enrollment.id, true)
    expect(res.success).toBe(true)
    expect(await contractSignedAt(enrollment.id)).not.toBeNull()
  })

  it('returns failure for an unknown enrollment id', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    const res = await setEnrollmentContractSignedByTeacher('does-not-exist', true)
    expect(res.success).toBe(false)
  })

  // Authorisation runs before the enrollment lookup, so a non-teacher is
  // rejected outright rather than being told whether the id exists.
  it('rejects a student without revealing whether the enrollment exists', async () => {
    const student = await createStudent({ city: 'SPLIT' })
    const { enrollment } = await seedEnrollment('SPLIT')
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    await expect(
      setEnrollmentContractSignedByTeacher('does-not-exist', true),
    ).rejects.toThrow()
    await expect(
      setEnrollmentContractSignedByTeacher(enrollment.id, true),
    ).rejects.toThrow()
    expect(await contractSignedAt(enrollment.id)).toBeNull()
  })

  it('rejects an anonymous caller', async () => {
    mockSession(null)
    await expect(
      setEnrollmentContractSignedByTeacher('whatever', true),
    ).rejects.toThrow()
  })
})
