'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import { createStudentSchema } from '@/lib/validators/admin/student'
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
    status: string
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

function computeSchoolYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
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

export async function createStudentFromInquiry(
  inquiryId: string,
  groupId: string,
  moduleIds?: string[],
): Promise<CreateStudentResult> {
  await requireAdmin()

  const parsed = createStudentSchema.safeParse({ inquiryId, groupId })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  try {
    const inquiry = await db.inquiry.findUnique({
      where: { id: inquiryId },
      include: { course: true },
    })

    if (!inquiry) return { success: false, error: 'Upit nije pronađen.' }
    if (inquiry.status === 'ACCOUNT_CREATED') {
      return { success: false, error: 'Račun je već stvoren za ovaj upit.' }
    }
    if (inquiry.status === 'DECLINED') {
      return { success: false, error: 'Upit je odbijen.' }
    }

    const group = await db.scheduledGroup.findUnique({
      where: { id: groupId },
      include: { location: true, course: true },
    })

    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

    const childFirst = inquiry.childFirstName
    const childLast = inquiry.childLastName
    const childDob = inquiry.childDateOfBirth

    // Dedup: find existing student with same name + DOB
    const existingStudent = childDob
      ? await db.user.findFirst({
          where: {
            role: 'STUDENT',
            firstName: { equals: childFirst, mode: 'insensitive' },
            lastName: { equals: childLast, mode: 'insensitive' },
            dateOfBirth: childDob,
          },
          select: { id: true, username: true, plainPassword: true },
        })
      : null

    let user: { id: string; username: string | null; plainPassword: string | null }
    let password = ''
    const isExisting = !!existingStudent

    if (existingStudent) {
      user = existingStudent
      password = existingStudent.plainPassword ?? ''
    } else {
      const username = await generateUsername(childFirst, childLast)
      password = generateSimplePassword(6)
      const passwordHash = await hashPassword(password)

      user = await db.user.create({
        data: {
          email: `${username}@student.inovatic.local`,
          username,
          plainPassword: password,
          passwordHash,
          firstName: childFirst,
          lastName: childLast,
          dateOfBirth: childDob ?? null,
          role: 'STUDENT',
        },
      })
    }

    const schoolYear = computeSchoolYear()

    // Check if this exact enrollment already exists
    const existingEnrollment = await db.enrollment.findUnique({
      where: {
        userId_scheduledGroupId_schoolYear: {
          userId: user.id,
          scheduledGroupId: groupId,
          schoolYear,
        },
      },
    })

    let enrollmentId: string

    if (existingEnrollment) {
      enrollmentId = existingEnrollment.id
    } else {
      const enrollment = await db.enrollment.create({
        data: {
          userId: user.id,
          scheduledGroupId: groupId,
          schoolYear,
          status: 'ACTIVE',
        },
      })
      enrollmentId = enrollment.id
    }

    // Create module enrollments for standard courses
    if (moduleIds && moduleIds.length > 0) {
      await db.moduleEnrollment.createMany({
        data: moduleIds.map((moduleId) => ({
          enrollmentId,
          moduleId,
        })),
        skipDuplicates: true,
      })
    }

    await db.inquiry.update({
      where: { id: inquiryId },
      data: {
        status: 'ACCOUNT_CREATED',
        studentId: user.id,
        assignedGroupId: groupId,
      },
    })

    // Send email
    const childName = `${childFirst} ${childLast}`.trim()
    const schedule = [group.dayOfWeek, group.startTime ? `${group.startTime}–${group.endTime ?? ''}` : null]
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
          username: user.username ?? '',
          password,
          groupName: group.name ?? group.course.title,
          schedule,
          locationName: group.location.name,
        }),
      })
    }

    revalidatePath('/admin/upiti')
    revalidatePath(`/admin/upiti/${inquiryId}`)
    revalidatePath('/admin/ucenici')

    return {
      success: true,
      username: user.username ?? '',
      password,
      isExisting,
      studentId: user.id,
    }
  } catch (err) {
    console.error('createStudentFromInquiry failed:', err)
    return { success: false, error: 'Greška pri kreiranju računa.' }
  }
}

export type StudentFilters = {
  search?: string
  courseId?: string
  groupId?: string
  moduleId?: string
  page?: number
  pageSize?: number
}

export async function getStudents(
  filters: StudentFilters = {},
): Promise<PaginatedResult<StudentRow>> {
  await requireAdmin()

  const { search, courseId, groupId, moduleId, page = 1, pageSize = 20 } = filters

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
    ...(courseId || groupId || moduleId
      ? {
          enrollments: {
            some: {
              ...(groupId ? { scheduledGroupId: groupId } : {}),
              ...(courseId ? { scheduledGroup: { courseId } } : {}),
              ...(moduleId ? { moduleEnrollments: { some: { moduleId, status: 'ACTIVE' as const } } } : {}),
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
          where: { status: 'ACTIVE' },
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
              course: { select: { id: true, title: true, level: true } },
              location: { select: { name: true, address: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      createdFromInquiries: {
        select: {
          id: true,
          parentName: true,
          parentEmail: true,
          parentPhone: true,
          childDateOfBirth: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
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

export async function toggleEnrollment(enrollmentId: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!enrollmentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) return { success: false, error: 'Upis nije pronađen.' }

    const newStatus = enrollment.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE'

    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { status: newStatus },
    })

    revalidatePath('/admin/ucenici')
    revalidatePath(`/admin/ucenici/${enrollment.userId}`)
    return { success: true }
  } catch (err) {
    console.error('toggleEnrollment failed:', err)
    return { success: false, error: 'Greška pri promjeni statusa upisa.' }
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
