/**
 * Direct-Prisma factories for the integration tier. Each function builds the
 * minimal set of related rows the model requires and returns the created
 * entity. Use overrides to customise specific fields.
 *
 * Reused by the Playwright tier via `tests/helpers/seed.ts` (Flux lu3f9sh).
 */
import bcrypt from 'bcryptjs'
import {
  type Attendance,
  type CourseModule,
  type Enrollment,
  type Inquiry,
  InquiryStatus,
  type Location,
  type Material,
  MaterialScope,
  MaterialType,
  type ScheduledGroup,
  type TeacherAssignment,
  type User,
  UserRole,
} from '@prisma/client'
import { db } from '@/lib/db'

let counter = 0
const uniq = () => `${Date.now().toString(36)}${(++counter).toString(36)}`

const HASH_ROUNDS = 4 // low rounds — tests don't need production security

async function createUser(
  overrides: Partial<{
    email: string
    username: string
    firstName: string
    lastName: string
    dateOfBirth: string | null
    password: string
    role: UserRole
    phone: string
    deletedAt: Date | null
  }> = {},
): Promise<User & { plainPassword: string }> {
  const id = uniq()
  const password = overrides.password ?? `pw-${id}`
  const role = overrides.role ?? UserRole.STUDENT
  const user = await db.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}-${id}@test.local`,
      username: overrides.username ?? `${role.toLowerCase()}_${id}`,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? `User${id}`,
      dateOfBirth: overrides.dateOfBirth ?? null,
      passwordHash: await bcrypt.hash(password, HASH_ROUNDS),
      role,
      phone: overrides.phone,
      deletedAt: overrides.deletedAt ?? null,
    },
  })
  return { ...user, plainPassword: password }
}

export const createAdmin = (overrides: Parameters<typeof createUser>[0] = {}) =>
  createUser({ ...overrides, role: UserRole.ADMIN })

export const createTeacher = (overrides: Parameters<typeof createUser>[0] = {}) =>
  createUser({ ...overrides, role: UserRole.TEACHER })

export const createStudent = (overrides: Parameters<typeof createUser>[0] = {}) =>
  createUser({ ...overrides, role: UserRole.STUDENT })

export async function createLocation(
  overrides: Partial<{ name: string; address: string }> = {},
): Promise<Location> {
  const id = uniq()
  return db.location.create({
    data: {
      name: overrides.name ?? `Lokacija ${id}`,
      address: overrides.address ?? `Test ulica ${id}`,
    },
  })
}

type CreateCourseOverrides = {
  title?: string
  slug?: string
  description?: string
  isCustom?: boolean
  schoolYear?: string | null
  ageMin?: number
  ageMax?: number
}

export async function createCourse(overrides: CreateCourseOverrides = {}) {
  const id = uniq()
  return db.course.create({
    data: {
      slug: overrides.slug ?? `course-${id}`,
      title: overrides.title ?? `Course ${id}`,
      description: overrides.description ?? 'Test course',
      ageMin: overrides.ageMin ?? 6,
      ageMax: overrides.ageMax ?? 14,
      isCustom: overrides.isCustom ?? false,
      schoolYear: overrides.schoolYear ?? null,
    },
  })
}

export async function createModule(
  courseId: string,
  overrides: Partial<{ title: string; sortOrder: number }> = {},
): Promise<CourseModule> {
  const id = uniq()
  return db.courseModule.create({
    data: {
      courseId,
      title: overrides.title ?? `Modul ${id}`,
      sortOrder: overrides.sortOrder ?? 0,
    },
  })
}

type CreateGroupOverrides = {
  courseId?: string
  locationId?: string
  name?: string
  schoolYear?: string
  maxStudents?: number
  dayOfWeek?: string | null
  dateStart?: string | null
  dateEnd?: string | null
  startTime?: string
  endTime?: string
}

export async function createGroup(overrides: CreateGroupOverrides = {}): Promise<ScheduledGroup> {
  const courseId = overrides.courseId ?? (await createCourse()).id
  const locationId = overrides.locationId ?? (await createLocation()).id
  const id = uniq()
  // When the caller supplies a date range, treat the group as a radionica and
  // null out dayOfWeek; otherwise default to the standard-program weekday.
  const radionicaRange =
    overrides.dateStart !== undefined || overrides.dateEnd !== undefined
  return db.scheduledGroup.create({
    data: {
      courseId,
      locationId,
      name: overrides.name ?? `Grupa ${id}`,
      schoolYear: overrides.schoolYear ?? '2026/2027',
      maxStudents: overrides.maxStudents ?? 12,
      dayOfWeek: radionicaRange
        ? (overrides.dayOfWeek ?? null)
        : (overrides.dayOfWeek ?? 'Ponedjeljak'),
      dateStart: overrides.dateStart ?? null,
      dateEnd: overrides.dateEnd ?? null,
      startTime: overrides.startTime ?? '17:00',
      endTime: overrides.endTime ?? '18:30',
    },
  })
}

export async function createEnrollment(
  studentId: string,
  scheduledGroupId: string,
  overrides: Partial<{ schoolYear: string }> = {},
): Promise<Enrollment> {
  return db.enrollment.create({
    data: {
      userId: studentId,
      scheduledGroupId,
      schoolYear: overrides.schoolYear ?? '2026/2027',
    },
  })
}

type CreateInquiryOverrides = {
  parentName?: string
  parentEmail?: string
  parentPhone?: string
  childFirstName?: string
  childLastName?: string
  childDateOfBirth?: string | null
  childGrade?: string | null
  courseId?: string | null
  scheduledGroupId?: string | null
  assignedGroupId?: string | null
  status?: InquiryStatus
  /** Denormalized school year (server-derived in prod). Defaults to null. */
  schoolYear?: string | null
}

export async function createInquiry(
  overrides: CreateInquiryOverrides = {},
): Promise<Inquiry> {
  const id = uniq()
  return db.inquiry.create({
    data: {
      parentName: overrides.parentName ?? `Roditelj ${id}`,
      parentEmail: overrides.parentEmail ?? `inquiry-${id}@test.local`,
      parentPhone: overrides.parentPhone ?? '+38591000000',
      childFirstName: overrides.childFirstName ?? 'Dijete',
      childLastName: overrides.childLastName ?? `Test${id}`,
      childDateOfBirth: overrides.childDateOfBirth ?? '2015-06-12',
      childGrade: overrides.childGrade ?? null,
      courseId: overrides.courseId ?? null,
      scheduledGroupId: overrides.scheduledGroupId ?? null,
      assignedGroupId: overrides.assignedGroupId ?? null,
      status: overrides.status ?? InquiryStatus.NEW,
      schoolYear: overrides.schoolYear ?? null,
      consentGivenAt: new Date(),
    },
  })
}

export async function createTeacherAssignment(
  teacherId: string,
  scheduledGroupId: string,
): Promise<TeacherAssignment> {
  return db.teacherAssignment.create({
    data: { userId: teacherId, scheduledGroupId },
  })
}

export async function createAttendance(
  enrollmentId: string,
  recordedById: string,
  overrides: Partial<{ sessionDate: Date; present: boolean; note: string | null }> = {},
): Promise<Attendance> {
  return db.attendance.create({
    data: {
      enrollmentId,
      recordedById,
      sessionDate: overrides.sessionDate ?? new Date('2026-03-02T00:00:00.000Z'),
      present: overrides.present ?? true,
      note: overrides.note ?? null,
    },
  })
}

type CreateMaterialOverrides = {
  scope?: MaterialScope
  scheduledGroupId?: string
  courseId?: string
  moduleId?: string
  title?: string
  type?: MaterialType
  fileUrl?: string | null
  externalUrl?: string | null
  uploadedById?: string
}

export async function createMaterial(overrides: CreateMaterialOverrides = {}): Promise<Material> {
  const id = uniq()
  const scope = overrides.scope ?? MaterialScope.GROUP
  const uploadedById = overrides.uploadedById ?? (await createTeacher()).id
  return db.material.create({
    data: {
      scope,
      scheduledGroupId: overrides.scheduledGroupId ?? null,
      courseId: overrides.courseId ?? null,
      moduleId: overrides.moduleId ?? null,
      title: overrides.title ?? `Materijal ${id}`,
      type: overrides.type ?? MaterialType.LINK,
      fileUrl: overrides.fileUrl ?? null,
      externalUrl: overrides.externalUrl ?? 'https://example.com/x',
      uploadedById,
    },
  })
}
