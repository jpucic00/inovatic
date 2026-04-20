'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import {
  createStudentSchema,
  createStudentManuallySchema,
  addEnrollmentSchema,
  type CreateStudentManuallyInput,
  type AddEnrollmentInput,
} from '@/lib/validators/admin/student'
import { hashPassword, generateSimplePassword } from '@/lib/password'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { AccountCredentialsEmail } from '../../../emails/account-credentials'
import type { PaginatedResult } from './inquiry'

export type StudentRow = {
  id: string
  firstName: string
  lastName: string
  username: string | null
  createdAt: Date
  enrollments: {
    id: string
    scheduledGroup: {
      id: string
      name: string | null
      dayOfWeek: string | null
      startTime: string | null
      course: { id: string; title: string }
      location: { name: string }
    }
  }[]
}

export type CreateStudentResult =
  | { success: true; username: string; password: string; isExisting: boolean; studentId: string }
  | { success: false; error: string }

const DIACRITICS_MAP: Record<string, string> = {
  'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'd',
  'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'D',
}

function stripDiacritics(str: string): string {
  return str.replace(/[čćšžđČĆŠŽĐ]/g, (ch) => DIACRITICS_MAP[ch] ?? ch)
}

async function generateUsername(firstName: string, lastName: string): Promise<string> {
  const base = stripDiacritics(`${firstName}${lastName}`)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')

  const existing = await db.user.findUnique({ where: { username: base } })
  if (!existing) return base

  let suffix = 2
  while (true) {
    const candidate = `${base}${suffix}`
    const taken = await db.user.findUnique({ where: { username: candidate } })
    if (!taken) return candidate
    suffix++
  }
}

type CoreInput = {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  parentName?: string | null
  parentEmail?: string | null
  parentPhone?: string | null
  childSchool?: string | null
  gdprConsentAt?: Date | null
  groupId?: string | null
  moduleScheduleIds?: string[]
}

type CoreResult = {
  user: { id: string; username: string | null }
  password: string
  isExisting: boolean
  enrollmentId: string | null
  group: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    schoolYear: string
    course: { title: string; isCustom: boolean }
    location: { name: string }
  } | null
}

/**
 * Shared core for student creation (both inquiry-based and manual).
 * - Dedupes against existing students by firstName+lastName+dateOfBirth.
 * - When groupId is given, uses the target group's schoolYear (not
 *   computeSchoolYear()) so future-year enrollments work.
 * - Creates ModuleEnrollment rows when moduleScheduleIds is non-empty.
 */
async function createStudentCore(input: CoreInput): Promise<CoreResult> {
  // 1. Dedup on name + DOB (only if DOB is present)
  const existingStudent = input.dateOfBirth
    ? await db.user.findFirst({
        where: {
          role: 'STUDENT',
          firstName: { equals: input.firstName, mode: 'insensitive' },
          lastName: { equals: input.lastName, mode: 'insensitive' },
          dateOfBirth: input.dateOfBirth,
        },
        select: { id: true, username: true, plainPassword: true },
      })
    : null

  let user: { id: string; username: string | null }
  let password = ''
  const isExisting = !!existingStudent

  if (existingStudent) {
    user = { id: existingStudent.id, username: existingStudent.username }
    password = existingStudent.plainPassword ?? ''

    // Backfill parent/school/consent fields on the existing user if they're
    // currently empty and we have new values to write.
    const backfill: Record<string, string | Date | null> = {}
    if (input.parentName) backfill.parentName = input.parentName
    if (input.parentEmail) backfill.parentEmail = input.parentEmail
    if (input.parentPhone) backfill.parentPhone = input.parentPhone
    if (input.childSchool) backfill.childSchool = input.childSchool
    if (input.gdprConsentAt) backfill.gdprConsentAt = input.gdprConsentAt
    if (Object.keys(backfill).length > 0) {
      await db.user.update({
        where: { id: existingStudent.id },
        // Prisma typing: we only set fields that are defined above.
        data: backfill as never,
      })
    }
  } else {
    const username = await generateUsername(input.firstName, input.lastName)
    password = generateSimplePassword(6)
    const passwordHash = await hashPassword(password)

    const created = await db.user.create({
      data: {
        email: `${username}@student.inovatic.local`,
        username,
        plainPassword: password,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? null,
        role: 'STUDENT',
        parentName: input.parentName ?? null,
        parentEmail: input.parentEmail ?? null,
        parentPhone: input.parentPhone ?? null,
        childSchool: input.childSchool ?? null,
        gdprConsentAt: input.gdprConsentAt ?? null,
      },
      select: { id: true, username: true },
    })
    user = created
  }

  // 2. Optional enrollment (uses the group's own schoolYear)
  let enrollmentId: string | null = null
  let group: CoreResult['group'] = null

  if (input.groupId) {
    const sg = await db.scheduledGroup.findUnique({
      where: { id: input.groupId },
      include: {
        location: { select: { name: true } },
        course: { select: { title: true, isCustom: true } },
      },
    })
    if (!sg) throw new Error('Grupa nije pronađena.')
    group = sg

    const existingEnrollment = await db.enrollment.findUnique({
      where: {
        userId_scheduledGroupId_schoolYear: {
          userId: user.id,
          scheduledGroupId: sg.id,
          schoolYear: sg.schoolYear,
        },
      },
    })

    if (existingEnrollment) {
      enrollmentId = existingEnrollment.id
    } else {
      const created = await db.enrollment.create({
        data: {
          userId: user.id,
          scheduledGroupId: sg.id,
          schoolYear: sg.schoolYear,
        },
      })
      enrollmentId = created.id
    }

    if (input.moduleScheduleIds && input.moduleScheduleIds.length > 0) {
      await db.moduleEnrollment.createMany({
        data: input.moduleScheduleIds.map((moduleScheduleId) => ({
          enrollmentId: enrollmentId!,
          moduleScheduleId,
        })),
        skipDuplicates: true,
      })
    }
  }

  return { user, password, isExisting, enrollmentId, group }
}

export async function createStudentFromInquiry(
  inquiryId: string,
  groupId: string,
  moduleScheduleIds?: string[],
): Promise<CreateStudentResult> {
  await requireAdmin()

  const parsed = createStudentSchema.safeParse({ inquiryId, groupId })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  try {
    const inquiry = await db.inquiry.findUnique({
      where: { id: inquiryId },
    })

    if (!inquiry) return { success: false, error: 'Upit nije pronađen.' }
    if (inquiry.status === 'ACCOUNT_CREATED') {
      return { success: false, error: 'Račun je već stvoren za ovaj upit.' }
    }
    if (inquiry.status === 'DECLINED') {
      return { success: false, error: 'Upit je odbijen.' }
    }

    const core = await createStudentCore({
      firstName: inquiry.childFirstName,
      lastName: inquiry.childLastName,
      dateOfBirth: inquiry.childDateOfBirth,
      parentName: inquiry.parentName,
      parentEmail: inquiry.parentEmail,
      parentPhone: inquiry.parentPhone,
      childSchool: inquiry.childSchool,
      gdprConsentAt: inquiry.consentGivenAt,
      groupId,
      moduleScheduleIds,
    })

    if (!core.group) {
      // Shouldn't happen — createStudentSchema requires groupId, and
      // createStudentCore throws if the group isn't found.
      return { success: false, error: 'Grupa nije pronađena.' }
    }

    // Mark the inquiry as processed — kept for audit/historization.
    await db.inquiry.update({
      where: { id: inquiryId },
      data: {
        status: 'ACCOUNT_CREATED',
        studentId: core.user.id,
        assignedGroupId: groupId,
      },
    })

    // Send credentials email (only when Resend is configured)
    const childName = `${inquiry.childFirstName} ${inquiry.childLastName}`.trim()
    const schedule = [
      core.group.dayOfWeek,
      core.group.startTime ? `${core.group.startTime}–${core.group.endTime ?? ''}` : null,
    ]
      .filter(Boolean)
      .join(', ')

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: inquiry.parentEmail,
        subject: `Pristupni podaci za ${childName} – Inovatic`,
        react: AccountCredentialsEmail({
          parentName: inquiry.parentName,
          childName,
          username: core.user.username ?? '',
          password: core.password,
          groupName: core.group.name ?? core.group.course.title,
          schedule,
          locationName: core.group.location.name,
        }),
      })
    }

    revalidatePath('/admin/upiti')
    revalidatePath(`/admin/upiti/${inquiryId}`)
    revalidatePath('/admin/ucenici')

    return {
      success: true,
      username: core.user.username ?? '',
      password: core.password,
      isExisting: core.isExisting,
      studentId: core.user.id,
    }
  } catch (err) {
    console.error('createStudentFromInquiry failed:', err)
    return { success: false, error: 'Greška pri kreiranju računa.' }
  }
}

export async function createStudentManually(
  input: CreateStudentManuallyInput,
): Promise<CreateStudentResult> {
  await requireAdmin()

  const parsed = createStudentManuallySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const data = parsed.data

  try {
    const core = await createStudentCore({
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ?? null,
      parentName: data.parentName ?? null,
      parentEmail: data.parentEmail && data.parentEmail !== '' ? data.parentEmail : null,
      parentPhone: data.parentPhone ?? null,
      childSchool: data.childSchool ?? null,
      gdprConsentAt: null,
      groupId: data.groupId ?? null,
      moduleScheduleIds: data.moduleScheduleIds,
    })

    // Send credentials email only when we have both a parent email AND
    // initial group assignment. For new accounts only (skip deduped existing).
    const parentEmail = data.parentEmail && data.parentEmail !== '' ? data.parentEmail : null
    if (
      !core.isExisting &&
      parentEmail &&
      core.group &&
      process.env.RESEND_API_KEY
    ) {
      const childName = `${data.firstName} ${data.lastName}`.trim()
      const schedule = [
        core.group.dayOfWeek,
        core.group.startTime ? `${core.group.startTime}–${core.group.endTime ?? ''}` : null,
      ]
        .filter(Boolean)
        .join(', ')

      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: parentEmail,
        subject: `Pristupni podaci za ${childName} – Inovatic`,
        react: AccountCredentialsEmail({
          parentName: data.parentName ?? '',
          childName,
          username: core.user.username ?? '',
          password: core.password,
          groupName: core.group.name ?? core.group.course.title,
          schedule,
          locationName: core.group.location.name,
        }),
      })
    }

    revalidatePath('/admin/ucenici')
    revalidatePath(`/admin/ucenici/${core.user.id}`)

    return {
      success: true,
      username: core.user.username ?? '',
      password: core.password,
      isExisting: core.isExisting,
      studentId: core.user.id,
    }
  } catch (err) {
    console.error('createStudentManually failed:', err)
    return { success: false, error: 'Greška pri kreiranju učenika.' }
  }
}

export async function addEnrollment(
  input: AddEnrollmentInput,
): Promise<AdminActionResult & { enrollmentId?: string }> {
  await requireAdmin()

  const parsed = addEnrollmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { studentId, groupId, moduleScheduleIds } = parsed.data

  try {
    const student = await db.user.findUnique({
      where: { id: studentId, role: 'STUDENT' },
      select: { id: true },
    })
    if (!student) return { success: false, error: 'Učenik nije pronađen.' }

    const group = await db.scheduledGroup.findUnique({
      where: { id: groupId },
      select: { id: true, schoolYear: true },
    })
    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

    const existing = await db.enrollment.findUnique({
      where: {
        userId_scheduledGroupId_schoolYear: {
          userId: studentId,
          scheduledGroupId: groupId,
          schoolYear: group.schoolYear,
        },
      },
    })

    let enrollmentId: string
    if (existing) {
      enrollmentId = existing.id
    } else {
      const created = await db.enrollment.create({
        data: {
          userId: studentId,
          scheduledGroupId: groupId,
          schoolYear: group.schoolYear,
        },
      })
      enrollmentId = created.id
    }

    if (moduleScheduleIds && moduleScheduleIds.length > 0) {
      await db.moduleEnrollment.createMany({
        data: moduleScheduleIds.map((moduleScheduleId) => ({
          enrollmentId,
          moduleScheduleId,
        })),
        skipDuplicates: true,
      })
    }

    revalidatePath(`/admin/ucenici/${studentId}`)
    return { success: true, enrollmentId }
  } catch (err) {
    console.error('addEnrollment failed:', err)
    return { success: false, error: 'Greška pri upisu u grupu.' }
  }
}

/**
 * Hard-delete a module enrollment from the student detail view. The module
 * schedule then reappears in the "available to add" list. Used for admin
 * corrections — not the same as the group-view cancellation flow.
 */
export async function removeModuleEnrollment(
  moduleEnrollmentId: string,
  studentId: string,
): Promise<AdminActionResult> {
  await requireAdmin()
  if (!moduleEnrollmentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    await db.moduleEnrollment.delete({ where: { id: moduleEnrollmentId } })
  } catch (err) {
    console.error('removeModuleEnrollment failed:', err)
    return { success: false, error: 'Greška pri uklanjanju modula.' }
  }

  revalidatePath(`/admin/ucenici/${studentId}`)
  return { success: true }
}

export type StudentFilters = {
  search?: string
  courseId?: string
  groupId?: string
  scheduleId?: string
  page?: number
  pageSize?: number
}

export async function getStudents(
  filters: StudentFilters = {},
): Promise<PaginatedResult<StudentRow>> {
  await requireAdmin()

  const { search, courseId, groupId, scheduleId, page = 1, pageSize = 20 } = filters

  const where = {
    role: 'STUDENT' as const,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(courseId || groupId || scheduleId
      ? {
          enrollments: {
            some: {
              ...(groupId ? { scheduledGroupId: groupId } : {}),
              ...(courseId ? { scheduledGroup: { courseId } } : {}),
              ...(scheduleId ? { moduleEnrollments: { some: { moduleScheduleId: scheduleId } } } : {}),
            },
          },
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        createdAt: true,
        enrollments: {
          include: {
            scheduledGroup: {
              include: {
                course: { select: { id: true, title: true } },
                location: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ])

  return {
    data: data as StudentRow[],
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  }
}

export async function getStudent(id: string) {
  await requireAdmin()

  return db.user.findUnique({
    where: { id, role: 'STUDENT' },
    include: {
      enrollments: {
        include: {
          scheduledGroup: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  level: true,
                  isCustom: true,
                  modules: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      title: true,
                      sortOrder: true,
                      schedules: {
                        select: {
                          id: true,
                          schoolYear: true,
                          startDate: true,
                          endDate: true,
                        },
                      },
                    },
                  },
                },
              },
              location: { select: { name: true, address: true } },
            },
          },
          moduleEnrollments: {
            include: {
              moduleSchedule: {
                select: {
                  id: true,
                  schoolYear: true,
                  module: { select: { id: true, title: true, sortOrder: true } },
                },
              },
            },
            orderBy: { moduleSchedule: { module: { sortOrder: 'asc' } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      studentComments: {
        include: {
          author: { select: { firstName: true, lastName: true } },
          module: { select: { id: true, title: true } },
          group: {
            select: {
              id: true,
              name: true,
              course: { select: { title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

export async function deleteEnrollment(enrollmentId: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!enrollmentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true },
    })
    if (!enrollment) return { success: false, error: 'Upis nije pronađen.' }

    await db.enrollment.delete({ where: { id: enrollmentId } })

    revalidatePath('/admin/ucenici')
    revalidatePath(`/admin/ucenici/${enrollment.userId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteEnrollment failed:', err)
    return { success: false, error: 'Greška pri brisanju upisa.' }
  }
}

export async function deleteStudent(studentId: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!studentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    // Clear studentId references on inquiries first
    await db.inquiry.updateMany({
      where: { studentId },
      data: { studentId: null },
    })

    // Delete user (cascades enrollments + student comments)
    await db.user.delete({ where: { id: studentId } })

    revalidatePath('/admin/ucenici')
    return { success: true }
  } catch (err) {
    console.error('deleteStudent failed:', err)
    return { success: false, error: 'Greška pri brisanju učenika.' }
  }
}
