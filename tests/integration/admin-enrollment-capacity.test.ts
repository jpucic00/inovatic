import { describe, expect, it, vi, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createLocation,
  createStudent,
} from './helpers/factory'

// The admin actions call revalidatePath on success. next/cache is a no-op
// outside a request scope; stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeAll(() => {
  // The createStudent* actions try to send credentials via Resend when
  // RESEND_API_KEY is present. The test environment shouldn't talk to Resend;
  // clear the var so the action skips the send.
  delete process.env.RESEND_API_KEY
})

const { addEnrollment, createStudentManually, createStudentFromInquiry } =
  await import('@/actions/admin/student')

async function fillGroup(groupId: string, count: number, schoolYear?: string): Promise<void> {
  for (let i = 0; i < count; i++) {
    const student = await createStudent()
    await createEnrollment(student.id, groupId, schoolYear ? { schoolYear } : {})
  }
}

describe('addEnrollment — capacity guardrail', () => {
  it('rejects with code GROUP_FULL when target group is at maxStudents', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ isCustom: true }) // skip the standard-course module-schedule branch
    const group = await createGroup({ courseId: radionica.id, maxStudents: 2 })
    await fillGroup(group.id, 2, group.schoolYear)

    const newStudent = await createStudent()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await addEnrollment({ studentId: newStudent.id, groupId: group.id })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.code).toBe('GROUP_FULL')
    }
    const enrollmentRows = await db.enrollment.count({
      where: { userId: newStudent.id, scheduledGroupId: group.id },
    })
    expect(enrollmentRows).toBe(0)
  })

  it('succeeds when student already has an Enrollment in that group (idempotent module add)', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ isCustom: true })
    const group = await createGroup({ courseId: radionica.id, maxStudents: 1 })
    const sittingStudent = await createStudent()
    await createEnrollment(sittingStudent.id, group.id, { schoolYear: group.schoolYear })
    // Group now full at capacity 1 with sittingStudent already inside.

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addEnrollment({ studentId: sittingStudent.id, groupId: group.id })

    expect(res.success).toBe(true)
    // Still exactly one enrollment row — re-running the action didn't create a duplicate.
    const enrollmentRows = await db.enrollment.count({
      where: { userId: sittingStudent.id, scheduledGroupId: group.id },
    })
    expect(enrollmentRows).toBe(1)
  })

  it('succeeds when spots are available', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ isCustom: true })
    const group = await createGroup({ courseId: radionica.id, maxStudents: 5 })
    await fillGroup(group.id, 2, group.schoolYear)

    const newStudent = await createStudent()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await addEnrollment({ studentId: newStudent.id, groupId: group.id })

    expect(res.success).toBe(true)
    if (res.success) expect(res.enrollmentId).toBeDefined()
  })
})

describe('createStudentManually — capacity guardrail', () => {
  it('rejects with GROUP_FULL when group is full and student is new', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ isCustom: true })
    const group = await createGroup({ courseId: radionica.id, maxStudents: 1 })
    await fillGroup(group.id, 1, group.schoolYear)

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentManually({
      firstName: 'Petar',
      lastName: 'Kapacitet',
      dateOfBirth: null,
      parentName: null,
      parentEmail: null,
      parentPhone: null,
      childSchool: null,
      groupId: group.id,
      moduleScheduleIds: [],
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.code).toBe('GROUP_FULL')

    const created = await db.user.findFirst({
      where: { firstName: 'Petar', lastName: 'Kapacitet' },
    })
    // The user creation happens inside the same tx as the enrollment, so a
    // rolled-back tx must NOT leave a stray User row behind.
    expect(created).toBeNull()
  })
})

describe('createStudentFromInquiry — capacity guardrail', () => {
  it('succeeds when admin picks the SAME group the inquiry preferred and it is at exact capacity', async () => {
    const admin = await createAdmin()
    const location = await createLocation()
    const radionica = await createCourse({ isCustom: true })
    const group = await createGroup({
      courseId: radionica.id,
      locationId: location.id,
      maxStudents: 3,
    })
    // 2 enrolled + 1 pending inquiry = group full at cap 3
    await fillGroup(group.id, 2, group.schoolYear)

    const myInquiry = await db.inquiry.create({
      data: {
        parentName: 'Test Parent',
        parentEmail: `inquiry-${Date.now()}@example.local`,
        parentPhone: '+38500000',
        childFirstName: 'Marko',
        childLastName: 'Same',
        childDateOfBirth: '2015-06-12',
        consentGivenAt: new Date(),
        courseId: radionica.id,
        scheduledGroupId: group.id,
        status: 'NEW',
      },
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(myInquiry.id, group.id)

    expect(res.success).toBe(true)
    if (res.success) expect(res.studentId).toBeDefined()

    const refreshed = await db.inquiry.findUnique({ where: { id: myInquiry.id } })
    expect(refreshed?.status).toBe('ACCOUNT_CREATED')
    expect(refreshed?.assignedGroupId).toBe(group.id)
  })

  it('rejects with GROUP_FULL when admin picks a DIFFERENT full group', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ isCustom: true })
    const preferred = await createGroup({ courseId: radionica.id, maxStudents: 3 })
    const fullOther = await createGroup({ courseId: radionica.id, maxStudents: 2 })
    await fillGroup(fullOther.id, 2, fullOther.schoolYear)

    const inquiry = await db.inquiry.create({
      data: {
        parentName: 'Other Parent',
        parentEmail: `other-${Date.now()}@example.local`,
        parentPhone: '+38500001',
        childFirstName: 'Ana',
        childLastName: 'Different',
        childDateOfBirth: '2014-09-01',
        consentGivenAt: new Date(),
        courseId: radionica.id,
        scheduledGroupId: preferred.id,
        status: 'NEW',
      },
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(inquiry.id, fullOther.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.code).toBe('GROUP_FULL')
  })

  it('rolls back the inquiry status update if the capacity assertion throws', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ isCustom: true })
    const preferred = await createGroup({ courseId: radionica.id, maxStudents: 5 })
    const fullOther = await createGroup({ courseId: radionica.id, maxStudents: 1 })
    await fillGroup(fullOther.id, 1, fullOther.schoolYear)

    const inquiry = await db.inquiry.create({
      data: {
        parentName: 'Rollback Parent',
        parentEmail: `rollback-${Date.now()}@example.local`,
        parentPhone: '+38500002',
        childFirstName: 'Iva',
        childLastName: 'Rollback',
        childDateOfBirth: '2013-11-20',
        consentGivenAt: new Date(),
        courseId: radionica.id,
        scheduledGroupId: preferred.id,
        status: 'NEW',
      },
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    await createStudentFromInquiry(inquiry.id, fullOther.id)

    const refreshed = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    // Tx rolled back — inquiry status must still be NEW so the admin can retry
    // with a different group.
    expect(refreshed?.status).toBe('NEW')
    expect(refreshed?.assignedGroupId).toBeNull()
    expect(refreshed?.studentId).toBeNull()
  })
})
