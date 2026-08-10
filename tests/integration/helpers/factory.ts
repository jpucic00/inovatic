/**
 * Direct-Prisma factories for the integration tier. Each function builds the
 * minimal set of related rows the model requires and returns the created
 * entity. Use overrides to customise specific fields.
 *
 * Reused by the Playwright tier via `tests/helpers/seed.ts` (Flux lu3f9sh).
 */
import type { ProgramKind } from '@prisma/client'
import bcrypt from 'bcryptjs'
import {
  type Attendance,
  type City,
  type CourseLevel,
  type CourseModule,
  type Enrollment,
  type Inquiry,
  InquiryStatus,
  type Location,
  type Material,
  MaterialScope,
  MaterialType,
  type ModuleEnrollment,
  type ModuleSchedule,
  type RecommendationKind,
  type ScheduledGroup,
  type SkillLevel,
  type StudentAssessment,
  type TeacherAssignment,
  type TeacherAttendance,
  type User,
  UserRole,
} from '@prisma/client'
import { db } from '@/lib/db'

// Vitest gives every test file its own module registry, so `counter` restarts
// at 0 per file — two files that start inside the same millisecond used to mint
// the same email and fail on the User.email unique. The per-registry random
// block makes the id unique regardless of clock resolution or file order.
const REGISTRY_ID = Math.random().toString(36).slice(2, 8)
let counter = 0
const uniq = () => `${Date.now().toString(36)}${REGISTRY_ID}${(++counter).toString(36)}`

const HASH_ROUNDS = 4 // low rounds — tests don't need production security

/**
 * A `YYYY-MM-DD` key `days` from today. Radionica groups are only offered on the
 * public form while their `dateStart` is still ahead (`isRadionicaOpenForSignup`),
 * so any fixture that needs a bookable workshop must be dated relative to now —
 * a hardcoded literal silently expires and takes the test with it.
 */
export function relativeDateKey(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

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
    city: City
    parentName: string | null
    parentEmail: string | null
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
      city: overrides.city ?? 'SPLIT',
      parentName: overrides.parentName ?? null,
      parentEmail: overrides.parentEmail ?? null,
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
  overrides: Partial<{ name: string; address: string; city: City }> = {},
): Promise<Location> {
  const id = uniq()
  return db.location.create({
    data: {
      name: overrides.name ?? `Lokacija ${id}`,
      address: overrides.address ?? `Test ulica ${id}`,
      city: overrides.city ?? 'SPLIT',
    },
  })
}

type CreateCourseOverrides = {
  title?: string
  slug?: string
  description?: string
  kind?: ProgramKind
  /** Rung on the SLR ladder — what the default razred rule matches on. */
  level?: CourseLevel | null
  schoolYear?: string | null
  ageMin?: number
  ageMax?: number
  price?: number | null
  /** null (default) = shared standard SLR; set it for a per-city radionica. */
  city?: City | null
}

/**
 * Course slugs are globally unique and the integration DB is shared by every
 * test file in the tier, so two files both needing a well-known slug (`slr-2`,
 * `natjecateljski-program`) would race on whichever ran second. Reuse the row
 * instead of failing — use this whenever the slug is fixed rather than generated.
 */
export async function ensureCourse(overrides: CreateCourseOverrides & { slug: string }) {
  const existing = await db.course.findUnique({ where: { slug: overrides.slug } })
  return existing ?? createCourse(overrides)
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
      price: overrides.price ?? null,
      kind: overrides.kind ?? 'STANDARD',
      level: overrides.level ?? null,
      // Legacy mirror of `kind` — kept in sync exactly as createCourse does.
      isCustom: (overrides.kind ?? 'STANDARD') === 'RADIONICA',
      schoolYear: overrides.schoolYear ?? null,
      city: overrides.city ?? null,
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
  city?: City
}

export async function createGroup(overrides: CreateGroupOverrides = {}): Promise<ScheduledGroup> {
  const city = overrides.city ?? 'SPLIT'
  const courseId = overrides.courseId ?? (await createCourse()).id
  // Auto-created location inherits the group's city so the composite
  // (locationId, city) → Location(id, city) FK holds.
  const locationId = overrides.locationId ?? (await createLocation({ city })).id
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
      city,
    },
  })
}

export async function createCourseSeason(
  courseId: string,
  overrides: Partial<{
    schoolYear: string
    city: City
    startDate: Date | null
    endDate: Date | null
  }> = {},
) {
  return db.courseSeason.create({
    data: {
      courseId,
      schoolYear: overrides.schoolYear ?? '2026/2027',
      city: overrides.city ?? 'SPLIT',
      startDate: overrides.startDate ?? new Date('2026-09-15T00:00:00.000Z'),
      endDate: overrides.endDate ?? new Date('2027-06-15T00:00:00.000Z'),
    },
  })
}

export async function createEnrollment(
  studentId: string,
  scheduledGroupId: string,
  overrides: Partial<{ schoolYear: string; fullYearPaidAt: Date | null }> = {},
): Promise<Enrollment> {
  return db.enrollment.create({
    data: {
      userId: studentId,
      scheduledGroupId,
      schoolYear: overrides.schoolYear ?? '2026/2027',
      fullYearPaidAt: overrides.fullYearPaidAt ?? null,
    },
  })
}

/**
 * A report card for (student, group). Defaults to a fully graded STANDARD rubric
 * so a caller who only cares that a card EXISTS gets a non-blank one; pass
 * explicit nulls for the partial and blank cases.
 */
export async function createAssessment(
  studentId: string,
  groupId: string,
  authorId: string,
  overrides: Partial<{
    slaganje: SkillLevel | null
    programiranje: SkillLevel | null
    razradaIdeja: SkillLevel | null
    izvedivost: SkillLevel | null
    inovacije: SkillLevel | null
    suradnja: SkillLevel | null
    komunikacija: SkillLevel | null
    zabava: SkillLevel | null
    opisnaOcjena: string | null
    recommendationKind: RecommendationKind | null
    recommendedCourseId: string | null
  }> = {},
): Promise<StudentAssessment> {
  const level = (value: SkillLevel | null | undefined, fallback: SkillLevel | null) =>
    value === undefined ? fallback : value
  return db.studentAssessment.create({
    data: {
      studentId,
      groupId,
      authorId,
      slaganje: level(overrides.slaganje, 'OSTVARENO'),
      programiranje: level(overrides.programiranje, 'U_RAZVOJU'),
      // Null by default: these belong to the COMPETITION rubric, and
      // `upsertStudentAssessment` never writes them on a standard group.
      razradaIdeja: level(overrides.razradaIdeja, null),
      izvedivost: level(overrides.izvedivost, null),
      inovacije: level(overrides.inovacije, 'OSTVARENO'),
      suradnja: level(overrides.suradnja, 'OSTVARENO'),
      komunikacija: level(overrides.komunikacija, 'U_RAZVOJU'),
      zabava: level(overrides.zabava, 'OSTVARENO'),
      opisnaOcjena: overrides.opisnaOcjena === undefined ? 'Napredovao je kroz godinu.' : overrides.opisnaOcjena,
      recommendationKind: overrides.recommendationKind ?? null,
      recommendedCourseId: overrides.recommendedCourseId ?? null,
    },
  })
}

export async function createModuleSchedule(
  moduleId: string,
  overrides: Partial<{
    schoolYear: string
    startDate: Date | null
    endDate: Date | null
    city: City
  }> = {},
): Promise<ModuleSchedule> {
  return db.moduleSchedule.create({
    data: {
      moduleId,
      schoolYear: overrides.schoolYear ?? '2026/2027',
      startDate: overrides.startDate ?? null,
      endDate: overrides.endDate ?? null,
      city: overrides.city ?? 'SPLIT',
    },
  })
}

export async function createEnrollmentWindow(
  courseId: string,
  overrides: Partial<{
    schoolYear: string
    city: City
    enrollmentStart: Date | null
    enrollmentEnd: Date | null
  }> = {},
) {
  return db.courseEnrollmentWindow.create({
    data: {
      courseId,
      schoolYear: overrides.schoolYear ?? '2026/2027',
      city: overrides.city ?? 'SPLIT',
      enrollmentStart: overrides.enrollmentStart ?? null,
      enrollmentEnd: overrides.enrollmentEnd ?? null,
    },
  })
}

export async function createCourseGradeRule(
  courseId: string,
  grades: string[],
  overrides: Partial<{ schoolYear: string; city: City }> = {},
) {
  return db.courseGradeRule.create({
    data: {
      courseId,
      grades,
      schoolYear: overrides.schoolYear ?? '2026/2027',
      city: overrides.city ?? 'SPLIT',
    },
  })
}

export async function createModuleEnrollment(
  enrollmentId: string,
  moduleScheduleId: string,
  overrides: Partial<{ paidAt: Date | null }> = {},
): Promise<ModuleEnrollment> {
  return db.moduleEnrollment.create({
    data: {
      enrollmentId,
      moduleScheduleId,
      paidAt: overrides.paidAt ?? null,
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
  city?: City
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
      city: overrides.city ?? 'SPLIT',
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

/**
 * A teacher's booked hour on a group — the payout basis. Keyed on the group
 * directly (not on TeacherAssignment), so a row survives unassignment.
 * `recordedById` defaults to the teacher, matching the single-teacher group
 * case where `bulkMarkSession` books them automatically.
 */
export async function createTeacherAttendance(
  teacherId: string,
  scheduledGroupId: string,
  overrides: Partial<{ sessionDate: Date; present: boolean; recordedById: string }> = {},
): Promise<TeacherAttendance> {
  return db.teacherAttendance.create({
    data: {
      userId: teacherId,
      scheduledGroupId,
      recordedById: overrides.recordedById ?? teacherId,
      sessionDate: overrides.sessionDate ?? new Date('2026-03-02T00:00:00.000Z'),
      present: overrides.present ?? true,
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
