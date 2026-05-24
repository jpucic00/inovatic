'use server'

import type { Prisma } from '@prisma/client'
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
import {
  GroupFullError,
  assertGroupHasAvailableSpot,
  runWithGroupCapacityGuard,
} from '@/lib/group-capacity'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { archivedYearError, archivedGroupError } from '@/lib/school-year-guard'
import { AccountCredentialsEmail } from '../../../emails/account-credentials'
import type { PaginatedResult } from './inquiry'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

const GROUP_FULL_ERROR = 'Grupa je u međuvremenu popunjena.'

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

type CreateStudentResult =
  | { success: true; username: string; password: string; isExisting: boolean; studentId: string }
  | { success: false; error: string; code?: 'GROUP_FULL' }

const DIACRITICS_MAP: Record<string, string> = {
  'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'd',
  'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'D',
}

function stripDiacritics(str: string): string {
  return str.replaceAll(/[čćšžđČĆŠŽĐ]/g, (ch) => DIACRITICS_MAP[ch] ?? ch)
}

async function generateUsername(
  tx: TxClient,
  firstName: string,
  lastName: string,
): Promise<string> {
  const base = stripDiacritics(`${firstName}${lastName}`)
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[^a-z0-9]/g, '')

  const existing = await tx.user.findUnique({ where: { username: base } })
  if (!existing) return base

  let suffix = 2
  while (true) {
    const candidate = `${base}${suffix}`
    const taken = await tx.user.findUnique({ where: { username: candidate } })
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

async function findOrCreateStudent(
  tx: TxClient,
  input: CoreInput,
): Promise<{ user: { id: string; username: string | null }; password: string; isExisting: boolean }> {
  const existingStudent = input.dateOfBirth
    ? await tx.user.findFirst({
        where: {
          role: 'STUDENT',
          firstName: { equals: input.firstName, mode: 'insensitive' },
          lastName: { equals: input.lastName, mode: 'insensitive' },
          dateOfBirth: input.dateOfBirth,
        },
        select: { id: true, username: true, plainPassword: true },
      })
    : null

  if (existingStudent) {
    const backfill: Prisma.UserUpdateInput = {}
    if (input.parentName) backfill.parentName = input.parentName
    if (input.parentEmail) backfill.parentEmail = input.parentEmail
    if (input.parentPhone) backfill.parentPhone = input.parentPhone
    if (input.childSchool) backfill.childSchool = input.childSchool
    if (input.gdprConsentAt) backfill.gdprConsentAt = input.gdprConsentAt
    if (Object.keys(backfill).length > 0) {
      await tx.user.update({
        where: { id: existingStudent.id },
        data: backfill,
      })
    }
    return {
      user: { id: existingStudent.id, username: existingStudent.username },
      password: existingStudent.plainPassword ?? '',
      isExisting: true,
    }
  }

  const username = await generateUsername(tx, input.firstName, input.lastName)
  const password = generateSimplePassword(6)
  const passwordHash = await hashPassword(password)

  const created = await tx.user.create({
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
  return { user: created, password, isExisting: false }
}

const ENSURE_ENROLLMENT_DEFAULT_OPTIONS = { assertCapacity: true } as const

async function ensureEnrollment(
  tx: TxClient,
  userId: string,
  groupId: string,
  moduleScheduleIds: string[] | undefined,
  options: { assertCapacity: boolean } = ENSURE_ENROLLMENT_DEFAULT_OPTIONS,
): Promise<{ enrollmentId: string; group: CoreResult['group'] }> {
  const sg = await tx.scheduledGroup.findUnique({
    where: { id: groupId },
    include: {
      location: { select: { name: true } },
      course: { select: { title: true, isCustom: true } },
    },
  })
  if (!sg) throw new Error('Grupa nije pronađena.')

  const existingEnrollment = await tx.enrollment.findUnique({
    where: {
      userId_scheduledGroupId_schoolYear: {
        userId,
        scheduledGroupId: sg.id,
        schoolYear: sg.schoolYear,
      },
    },
  })

  // Only assert capacity when we'd actually be claiming a new spot. An
  // existing Enrollment row means we're only adding ModuleEnrollment rows;
  // the student already occupies a seat in this (group, schoolYear).
  if (!existingEnrollment && options.assertCapacity) {
    await assertGroupHasAvailableSpot(tx, sg.id)
  }

  const enrollmentId = existingEnrollment
    ? existingEnrollment.id
    : (await tx.enrollment.create({
        data: { userId, scheduledGroupId: sg.id, schoolYear: sg.schoolYear },
      })).id

  if (moduleScheduleIds && moduleScheduleIds.length > 0) {
    await tx.moduleEnrollment.createMany({
      data: moduleScheduleIds.map((moduleScheduleId) => ({
        enrollmentId,
        moduleScheduleId,
      })),
      skipDuplicates: true,
    })
  }

  return { enrollmentId, group: sg }
}

/**
 * Shared core for student creation (both inquiry-based and manual).
 * - Dedupes against existing students by firstName+lastName+dateOfBirth.
 * - When groupId is given, uses the target group's schoolYear (not
 *   computeSchoolYear()) so future-year enrollments work.
 * - Creates ModuleEnrollment rows when moduleScheduleIds is non-empty.
 * - Capacity is enforced by ensureEnrollment when a new Enrollment row would
 *   be created; callers running on top of an inquiry that itself reserves a
 *   spot on the same target group must free that reservation BEFORE invoking
 *   createStudentCore so the count doesn't double.
 */
async function createStudentCore(tx: TxClient, input: CoreInput): Promise<CoreResult> {
  const { user, password, isExisting } = await findOrCreateStudent(tx, input)

  if (!input.groupId) {
    return { user, password, isExisting, enrollmentId: null, group: null }
  }

  const { enrollmentId, group } = await ensureEnrollment(
    tx,
    user.id,
    input.groupId,
    input.moduleScheduleIds,
  )
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

  // Pre-flight status check so we can return a clean error without spinning
  // up a transaction. The tx body re-checks under serializable isolation.
  const inquiryPreview = await db.inquiry.findUnique({ where: { id: inquiryId } })
  if (!inquiryPreview) return { success: false, error: 'Upit nije pronađen.' }
  if (inquiryPreview.status === 'ACCOUNT_CREATED') {
    return { success: false, error: 'Račun je već stvoren za ovaj upit.' }
  }
  if (inquiryPreview.status === 'DECLINED') {
    return { success: false, error: 'Upit je odbijen.' }
  }

  const archived = await archivedGroupError(groupId)
  if (archived) return archived

  let core: CoreResult
  let inquiry: typeof inquiryPreview
  try {
    const result = await runWithGroupCapacityGuard(async (tx) => {
      const fresh = await tx.inquiry.findUnique({ where: { id: inquiryId } })
      if (!fresh) throw new Error('Upit nije pronađen.')
      if (fresh.status === 'ACCOUNT_CREATED') {
        throw new Error('Račun je već stvoren za ovaj upit.')
      }
      if (fresh.status === 'DECLINED') {
        throw new Error('Upit je odbijen.')
      }

      // Free this inquiry's reservation BEFORE the capacity assertion so the
      // count doesn't include the spot we're about to claim. Inquiry-mark
      // first; backfill studentId/assignedGroupId once we have them.
      await tx.inquiry.update({
        where: { id: inquiryId },
        data: { status: 'ACCOUNT_CREATED' },
      })

      const created = await createStudentCore(tx, {
        firstName: fresh.childFirstName,
        lastName: fresh.childLastName,
        dateOfBirth: fresh.childDateOfBirth,
        parentName: fresh.parentName,
        parentEmail: fresh.parentEmail,
        parentPhone: fresh.parentPhone,
        childSchool: fresh.childSchool,
        gdprConsentAt: fresh.consentGivenAt,
        groupId,
        moduleScheduleIds,
      })

      if (!created.group) {
        throw new Error('Grupa nije pronađena.')
      }

      await tx.inquiry.update({
        where: { id: inquiryId },
        data: { studentId: created.user.id, assignedGroupId: groupId },
      })

      return { core: created, inquiry: fresh }
    })
    core = result.core
    inquiry = result.inquiry
  } catch (err) {
    if (err instanceof GroupFullError) {
      return { success: false, error: GROUP_FULL_ERROR, code: 'GROUP_FULL' }
    }
    if (err instanceof Error) {
      const msg = err.message
      if (
        msg === 'Upit nije pronađen.' ||
        msg === 'Račun je već stvoren za ovaj upit.' ||
        msg === 'Upit je odbijen.' ||
        msg === 'Grupa nije pronađena.'
      ) {
        return { success: false, error: msg }
      }
    }
    console.error('createStudentFromInquiry failed:', err)
    return { success: false, error: 'Greška pri kreiranju računa.' }
  }

  if (!core.group) {
    return { success: false, error: 'Grupa nije pronađena.' }
  }

  try {
    await sendInquiryCredentialsEmail(inquiry, core)
  } catch (err) {
    console.error('createStudentFromInquiry failed:', err)
    return { success: false, error: 'Greška pri kreiranju računa.' }
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
}

type InquiryEmailContext = {
  childFirstName: string
  childLastName: string
  parentName: string
  parentEmail: string
}

async function sendInquiryCredentialsEmail(
  inquiry: InquiryEmailContext,
  core: CoreResult,
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !core.group) return

  const childName = `${inquiry.childFirstName} ${inquiry.childLastName}`.trim()
  const schedule = [
    core.group.dayOfWeek,
    core.group.startTime ? `${core.group.startTime}–${core.group.endTime ?? ''}` : null,
  ]
    .filter(Boolean)
    .join(', ')

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

export async function createStudentManually(
  input: CreateStudentManuallyInput,
): Promise<CreateStudentResult> {
  await requireAdmin()

  const parsed = createStudentManuallySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const data = parsed.data

  if (data.groupId) {
    const archived = await archivedGroupError(data.groupId)
    if (archived) return archived
  }

  let core: CoreResult
  try {
    core = await runWithGroupCapacityGuard((tx) =>
      createStudentCore(tx, {
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
      }),
    )
  } catch (err) {
    if (err instanceof GroupFullError) {
      return { success: false, error: GROUP_FULL_ERROR, code: 'GROUP_FULL' }
    }
    console.error('createStudentManually failed:', err)
    return { success: false, error: 'Greška pri kreiranju učenika.' }
  }

  try {
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

  // Lightweight pre-flight reads outside the tx for clean error mapping.
  const student = await db.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    select: { id: true },
  })
  if (!student) return { success: false, error: 'Učenik nije pronađen.' }

  const groupPreview = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { id: true, schoolYear: true },
  })
  if (!groupPreview) return { success: false, error: 'Grupa nije pronađena.' }

  const archived = archivedYearError(groupPreview.schoolYear)
  if (archived) return archived

  let enrollmentId: string
  try {
    enrollmentId = await runWithGroupCapacityGuard(async (tx) => {
      const existing = await tx.enrollment.findUnique({
        where: {
          userId_scheduledGroupId_schoolYear: {
            userId: studentId,
            scheduledGroupId: groupId,
            schoolYear: groupPreview.schoolYear,
          },
        },
      })

      if (!existing) {
        await assertGroupHasAvailableSpot(tx, groupId)
      }

      const enrollment =
        existing ??
        (await tx.enrollment.create({
          data: {
            userId: studentId,
            scheduledGroupId: groupId,
            schoolYear: groupPreview.schoolYear,
          },
        }))

      if (moduleScheduleIds && moduleScheduleIds.length > 0) {
        await tx.moduleEnrollment.createMany({
          data: moduleScheduleIds.map((moduleScheduleId) => ({
            enrollmentId: enrollment.id,
            moduleScheduleId,
          })),
          skipDuplicates: true,
        })
      }

      return enrollment.id
    })
  } catch (err) {
    if (err instanceof GroupFullError) {
      return { success: false, error: GROUP_FULL_ERROR, code: 'GROUP_FULL' }
    }
    console.error('addEnrollment failed:', err)
    return { success: false, error: 'Greška pri upisu u grupu.' }
  }

  revalidatePath(`/admin/ucenici/${studentId}`)
  return { success: true, enrollmentId }
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

type StudentFilters = {
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
          author: { select: { id: true, firstName: true, lastName: true, role: true, deletedAt: true } },
          module: { select: { id: true, title: true } },
          group: {
            select: {
              id: true,
              name: true,
              schoolYear: true,
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
