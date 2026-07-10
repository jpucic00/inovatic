import type { City } from '@prisma/client'
import { db } from '@/lib/db'

// ── Shared select fragments ──────────────────────────────────────────────────

const courseSelect = {
  id: true,
  title: true,
  level: true,
  isCustom: true,
  modules: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      title: true,
      sortOrder: true,
      schedules: {
        select: { id: true, schoolYear: true, city: true, startDate: true, endDate: true },
      },
    },
  },
} as const

const moduleEnrollmentSelect = {
  id: true,
  moduleSchedule: {
    select: {
      id: true,
      schoolYear: true,
      module: { select: { id: true, title: true, sortOrder: true } },
    },
  },
} as const

const commentSelect = {
  id: true,
  content: true,
  type: true,
  createdAt: true,
  moduleId: true,
  groupId: true,
  studentId: true,
  authorId: true,
  author: {
    select: { id: true, firstName: true, lastName: true, role: true, deletedAt: true },
  },
  module: { select: { id: true, title: true } },
  group: {
    select: {
      id: true,
      name: true,
      schoolYear: true,
      course: { select: { title: true } },
    },
  },
} as const

const baseEnrollmentSelect = {
  id: true,
  schoolYear: true,
  createdAt: true,
  scheduledGroup: {
    select: {
      id: true,
      name: true,
      city: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      dateStart: true,
      dateEnd: true,
      course: { select: courseSelect },
      location: { select: { name: true, address: true } },
    },
  },
  moduleEnrollments: {
    orderBy: { moduleSchedule: { module: { sortOrder: 'asc' as const } } },
    select: moduleEnrollmentSelect,
  },
} as const

const userBaseSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  username: true,
  plainPassword: true,
  phone: true,
  dateOfBirth: true,
  role: true,
  parentName: true,
  parentEmail: true,
  parentPhone: true,
  childSchool: true,
  gdprConsentAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

// ── Types ────────────────────────────────────────────────────────────────────

type AdminStudentResult = Awaited<ReturnType<typeof fetchForAdmin>>
type TeacherStudentResult = Awaited<ReturnType<typeof fetchForTeacher>>

export type StudentDetail = NonNullable<AdminStudentResult>

// Teacher result has the same shape but fullYearPaidAt / paidAt are absent from
// the Prisma select; the builder replaces them with null to keep one shared type.
type TeacherRaw = NonNullable<TeacherStudentResult>

// ── Private fetchers ─────────────────────────────────────────────────────────

function fetchForAdmin(id: string, city?: City) {
  return db.user.findUnique({
    // A cross-city student resolves to null — indistinguishable from a
    // nonexistent id, so admin callers surface it as a 404.
    where: { id, role: 'STUDENT', ...(city ? { city } : {}) },
    select: {
      ...userBaseSelect,
      enrollments: {
        orderBy: { createdAt: 'desc' },
        select: {
          ...baseEnrollmentSelect,
          fullYearPaidAt: true,
          moduleEnrollments: {
            orderBy: { moduleSchedule: { module: { sortOrder: 'asc' } } },
            select: { ...moduleEnrollmentSelect, paidAt: true },
          },
        },
      },
      studentComments: {
        orderBy: { createdAt: 'desc' },
        select: commentSelect,
      },
    },
  })
}

function fetchForTeacher(id: string) {
  return db.user.findUnique({
    where: { id, role: 'STUDENT' },
    select: {
      ...userBaseSelect,
      enrollments: {
        orderBy: { createdAt: 'desc' },
        select: {
          ...baseEnrollmentSelect,
          moduleEnrollments: {
            orderBy: { moduleSchedule: { module: { sortOrder: 'asc' } } },
            select: moduleEnrollmentSelect,
          },
        },
      },
      studentComments: {
        orderBy: { createdAt: 'desc' },
        select: commentSelect,
      },
    },
  })
}

// ── Public builders ──────────────────────────────────────────────────────────

// `city` scopes the lookup to the admin's tenant; teacher callers omit it
// (teacher-side city scoping is PR4).
export async function buildStudentDetailForAdmin(id: string, city?: City): Promise<StudentDetail | null> {
  return fetchForAdmin(id, city)
}

export async function buildStudentDetailForTeacher(id: string): Promise<StudentDetail | null> {
  const raw: TeacherRaw | null = await fetchForTeacher(id)
  if (!raw) return null

  return {
    ...raw,
    enrollments: raw.enrollments.map((e) => ({
      ...e,
      fullYearPaidAt: null,
      moduleEnrollments: e.moduleEnrollments.map((me) => ({ ...me, paidAt: null })),
    })),
  }
}
