import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
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
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'

// The admin actions call revalidatePath on success. next/cache is a no-op
// outside a request scope; stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// next/headers.cookies() is the source of the selected-school-year cookie.
// Stub it so getSelectedSchoolYear() returns a deterministic value per test;
// without this the loader queries return nothing because cookies() has no
// request scope in vitest.
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

// Mock the Resend SDK so the real sender service runs without building a client
// or hitting the network; emailSend is the controllable emails.send.
const { emailSend } = vi.hoisted(() => ({ emailSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailSend }
  },
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setSelectedYearCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined
        ? { value, name }
        : undefined,
  })
}

beforeAll(() => {
  // The createStudent* actions try to send credentials via Resend when
  // RESEND_API_KEY is present. The test environment shouldn't talk to Resend;
  // clear the var so the action skips the send.
  delete process.env.RESEND_API_KEY
  // Default cookie state — no selection, so getSelectedSchoolYear() falls
  // back to computeSchoolYear(). Per-test overrides via setSelectedYearCookie.
  setSelectedYearCookie(undefined)
})

const { addEnrollment, createStudentManually, createStudentFromInquiry } =
  await import('@/actions/admin/student')
const { getGroupsForCourse, getGroupsForCourseInSelectedYear } =
  await import('@/actions/admin/inquiry')

const ARCHIVED_ERROR_MSG = 'Arhivirana školska godina je samo za pregled.'

async function fillGroup(groupId: string, count: number, schoolYear?: string): Promise<void> {
  for (let i = 0; i < count; i++) {
    const student = await createStudent()
    await createEnrollment(student.id, groupId, schoolYear ? { schoolYear } : {})
  }
}

describe('addEnrollment — capacity guardrail', () => {
  it('rejects with code GROUP_FULL when target group is at maxStudents', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' }) // skip the standard-course module-schedule branch
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
    const radionica = await createCourse({ kind: 'RADIONICA' })
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
    const radionica = await createCourse({ kind: 'RADIONICA' })
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
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const group = await createGroup({ courseId: radionica.id, maxStudents: 1 })
    await fillGroup(group.id, 1, group.schoolYear)

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentManually({
      firstName: 'Petar',
      lastName: 'Kapacitet',
      dateOfBirth: '2015-03-03',
      parentName: null,
      parentEmail: `kapacitet-${Date.now()}@example.local`,
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
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const group = await createGroup({
      courseId: radionica.id,
      locationId: location.id,
      maxStudents: 3,
    })
    // 2 enrolled + 1 pending inquiry = group full at cap 3
    await fillGroup(group.id, 2, group.schoolYear)

    const myInquiry = await db.inquiry.create({
      data: {
        city: 'SPLIT',
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
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const preferred = await createGroup({ courseId: radionica.id, maxStudents: 3 })
    const fullOther = await createGroup({ courseId: radionica.id, maxStudents: 2 })
    await fillGroup(fullOther.id, 2, fullOther.schoolYear)

    const inquiry = await db.inquiry.create({
      data: {
        city: 'SPLIT',
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
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const preferred = await createGroup({ courseId: radionica.id, maxStudents: 5 })
    const fullOther = await createGroup({ courseId: radionica.id, maxStudents: 1 })
    await fillGroup(fullOther.id, 1, fullOther.schoolYear)

    const inquiry = await db.inquiry.create({
      data: {
        city: 'SPLIT',
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

describe('createStudentFromInquiry — error contract (named-error mapping)', () => {
  // After the string-match catch block was replaced with instanceof checks on
  // named error classes (InquiryNotFoundError / GroupNotFoundError etc.), the
  // localized Croatian copy lives only at the action-result boundary. These
  // pin that copy so a careless edit shows up in a diff instead of silently
  // demoting the error to the generic 'Greška pri kreiranju računa.' branch.
  it('returns "Upit nije pronađen." for a non-existent inquiry', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const group = await createGroup({ courseId: radionica.id, maxStudents: 5 })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createStudentFromInquiry('nonexistent-inquiry-id', group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Upit nije pronađen.')
  })

  it('returns "Grupa nije pronađena." for a valid inquiry but non-existent group', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' })

    const inquiry = await db.inquiry.create({
      data: {
        city: 'SPLIT',
        parentName: 'NoGroup Parent',
        parentEmail: `nogroup-${Date.now()}@example.local`,
        parentPhone: '+38500005',
        childFirstName: 'Bez',
        childLastName: 'Grupe',
        childDateOfBirth: '2015-05-05',
        consentGivenAt: new Date(),
        courseId: radionica.id,
        status: 'NEW',
      },
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(inquiry.id, 'nonexistent-group-id')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Grupa nije pronađena.')

    // No account created and the inquiry stays NEW so the admin can retry.
    const refreshed = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(refreshed?.status).toBe('NEW')
    expect(refreshed?.studentId).toBeNull()
  })
})

describe('archived-school-year guard — enrollment-creating actions', () => {
  it('addEnrollment rejects when target group is in an archived school year', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const archivedGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: '2024/2025',
    })
    const student = await createStudent()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await addEnrollment({
      studentId: student.id,
      groupId: archivedGroup.id,
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe(ARCHIVED_ERROR_MSG)

    const rows = await db.enrollment.count({
      where: { scheduledGroupId: archivedGroup.id },
    })
    expect(rows).toBe(0)
  })

  it('createStudentManually rejects when supplied groupId is in an archived year — no User, no Enrollment', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const archivedGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: '2024/2025',
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await createStudentManually({
      firstName: 'Arhiv',
      lastName: 'Reject',
      dateOfBirth: '2015-04-04',
      parentName: null,
      parentEmail: `arhiv-${Date.now()}@example.local`,
      parentPhone: null,
      childSchool: null,
      groupId: archivedGroup.id,
      moduleScheduleIds: [],
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe(ARCHIVED_ERROR_MSG)

    const stray = await db.user.findFirst({
      where: { firstName: 'Arhiv', lastName: 'Reject' },
    })
    expect(stray).toBeNull()
    const rows = await db.enrollment.count({
      where: { scheduledGroupId: archivedGroup.id },
    })
    expect(rows).toBe(0)
  })

  it('createStudentFromInquiry rejects archived-year group and leaves inquiry status NEW', async () => {
    const admin = await createAdmin()
    const location = await createLocation()
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const archivedGroup = await createGroup({
      courseId: radionica.id,
      locationId: location.id,
      schoolYear: '2024/2025',
    })

    const inquiry = await db.inquiry.create({
      data: {
        city: 'SPLIT',
        parentName: 'Archived Parent',
        parentEmail: `archived-${Date.now()}@example.local`,
        parentPhone: '+38500099',
        childFirstName: 'Stari',
        childLastName: 'Upit',
        childDateOfBirth: '2014-04-04',
        consentGivenAt: new Date(),
        courseId: radionica.id,
        status: 'NEW',
      },
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(inquiry.id, archivedGroup.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe(ARCHIVED_ERROR_MSG)

    const refreshed = await db.inquiry.findUnique({
      where: { id: inquiry.id },
    })
    expect(refreshed?.status).toBe('NEW')
    expect(refreshed?.studentId).toBeNull()
    expect(refreshed?.assignedGroupId).toBeNull()
    const rows = await db.enrollment.count({
      where: { scheduledGroupId: archivedGroup.id },
    })
    expect(rows).toBe(0)
  })
})

describe('group pickers — scope by selected school year', () => {
  beforeEach(() => {
    setSelectedYearCookie(undefined)
  })

  it('getGroupsForCourseInSelectedYear returns only the cookie-selected year', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const currentYear = computeSchoolYear()
    const futureYear = getNextSchoolYear(currentYear)
    // Register all years used as cookies so getSelectedSchoolYear passes validation.
    await db.schoolYear.upsert({ where: { label: currentYear }, create: { label: currentYear }, update: {} })
    await db.schoolYear.upsert({ where: { label: futureYear }, create: { label: futureYear }, update: {} })
    await db.schoolYear.upsert({ where: { label: '2024/2025' }, create: { label: '2024/2025' }, update: {} })
    const archivedGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: '2024/2025',
    })
    const currentGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: currentYear,
    })
    const futureGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: futureYear,
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    setSelectedYearCookie(futureYear)
    let res = await getGroupsForCourseInSelectedYear(radionica.id)
    expect(res.map((g) => g.id)).toEqual([futureGroup.id])

    setSelectedYearCookie('2024/2025')
    res = await getGroupsForCourseInSelectedYear(radionica.id)
    expect(res.map((g) => g.id)).toEqual([archivedGroup.id])

    setSelectedYearCookie(undefined)
    res = await getGroupsForCourseInSelectedYear(radionica.id)
    expect(res.map((g) => g.id)).toEqual([currentGroup.id])
  })

  it('getGroupsForCourse returns only the cookie-selected year', async () => {
    const admin = await createAdmin()
    const radionica = await createCourse({ kind: 'RADIONICA' })
    const currentYear = computeSchoolYear()
    const futureYear = getNextSchoolYear(currentYear)
    await db.schoolYear.upsert({ where: { label: currentYear }, create: { label: currentYear }, update: {} })
    await db.schoolYear.upsert({ where: { label: futureYear }, create: { label: futureYear }, update: {} })
    const currentGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: currentYear,
    })
    const futureGroup = await createGroup({
      courseId: radionica.id,
      schoolYear: futureYear,
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    setSelectedYearCookie(futureYear)
    let res = await getGroupsForCourse(radionica.id)
    expect(res.map((g) => g.id)).toEqual([futureGroup.id])

    setSelectedYearCookie(undefined)
    res = await getGroupsForCourse(radionica.id)
    expect(res.map((g) => g.id)).toEqual([currentGroup.id])
  })
})
