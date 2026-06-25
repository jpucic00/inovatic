'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { InquiryStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { declineInquirySchema } from '@/lib/validators/admin/inquiry'
import type { AdminActionResult } from '@/lib/action-types'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { ScheduleOptionsEmail } from '../../../emails/schedule-options'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { computeGroupCapacity } from '@/lib/group-capacity'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { formatGroupSchedule } from '@/lib/format'
import type { Grade } from '@/lib/inquiry-status'
import { studentIdentityWhere } from '@/lib/student-match'
import { flagReturningInquiries } from '@/lib/returning-inquiry'

type InquiryFilters = {
  status?: InquiryStatus | 'ALL'
  search?: string
  courseId?: string
  grade?: Grade
  page?: number
  pageSize?: number
}

export type PaginatedResult<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

function courseIdFilter(courseId: string | undefined) {
  if (courseId === 'NONE') return { courseId: null }
  if (courseId) return { courseId }
  return {}
}

type InquiryListRow = Awaited<ReturnType<typeof db.inquiry.findMany>>[number] & {
  isReturning: boolean
}

export async function getInquiries(
  filters: InquiryFilters = {},
): Promise<PaginatedResult<InquiryListRow>> {
  await requireAdmin()

  const { status, search, courseId, grade, page = 1, pageSize = 20 } = filters
  const schoolYear = await getSelectedSchoolYear()

  const where = {
    schoolYear,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(courseIdFilter(courseId)),
    ...(grade ? { childGrade: grade } : {}),
    ...(search
      ? {
          OR: [
            { parentName: { contains: search, mode: 'insensitive' as const } },
            { childFirstName: { contains: search, mode: 'insensitive' as const } },
            { childLastName: { contains: search, mode: 'insensitive' as const } },
            { parentEmail: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    db.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inquiry.count({ where }),
  ])

  const enriched = await flagReturningInquiries(data)
  return { data: enriched, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

type ReturningStudentInfo = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  history: {
    schoolYear: string
    groups: { courseTitle: string; groupName: string | null; locationName: string }[]
  }[]
}

/**
 * Returns the existing student matching this inquiry's child identity (firstName
 * + lastName + dateOfBirth), with their enrollment history grouped by school
 * year (newest first), or `null` when there is no DOB, no match, or the only
 * match is the student this inquiry itself created (`excludeStudentId`).
 */
export async function getReturningStudentInfo(input: {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  excludeStudentId?: string | null
}): Promise<ReturningStudentInfo | null> {
  await requireAdmin()

  const where = studentIdentityWhere(input)
  if (!where) return null

  const student = await db.user.findFirst({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      enrollments: {
        select: {
          schoolYear: true,
          scheduledGroup: {
            select: {
              name: true,
              course: { select: { title: true } },
              location: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  if (!student) return null
  if (input.excludeStudentId && student.id === input.excludeStudentId) return null

  const byYear = new Map<string, ReturningStudentInfo['history'][number]['groups']>()
  for (const e of student.enrollments) {
    const list = byYear.get(e.schoolYear) ?? []
    list.push({
      courseTitle: e.scheduledGroup.course.title,
      groupName: e.scheduledGroup.name,
      locationName: e.scheduledGroup.location.name,
    })
    byYear.set(e.schoolYear, list)
  }
  const history = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([schoolYear, groups]) => ({ schoolYear, groups }))

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth,
    history,
  }
}

export async function getInquiryCourses() {
  await requireAdmin()
  const year = await getSelectedSchoolYear()

  return db.course.findMany({
    // Mirror getCourses: standard courses are global; radionice are year-scoped,
    // so the Upiti program filter never lists other years' (always-empty) radionice.
    where: { OR: [{ isCustom: false }, { schoolYear: year }] },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  })
}

export async function getInquiry(id: string) {
  await requireAdmin()

  return db.inquiry.findUnique({
    where: { id },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          level: true,
        },
      },
      scheduledGroup: { include: { location: true } },
      assignedGroup: {
        include: { course: true, location: true },
      },
    },
  })
}

export async function declineInquiry(
  id: string,
  reason: string,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = declineInquirySchema.safeParse({ id, reason })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }

  try {
    await db.inquiry.update({
      where: { id: parsed.data.id },
      data: { status: 'DECLINED', declineReason: parsed.data.reason },
    })
  } catch (err) {
    console.error('declineInquiry failed:', err)
    return { success: false, error: 'Greška pri odbijanju upita.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${id}`)
  return { success: true }
}

export async function deleteInquiry(id: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    await db.inquiry.delete({ where: { id } })
  } catch (err) {
    console.error('deleteInquiry failed:', err)
    return { success: false, error: 'Greška pri brisanju upita.' }
  }

  revalidatePath('/admin/upiti')
  return { success: true }
}

export async function getGroupsForCourse(courseId: string) {
  await requireAdmin()
  const year = await getSelectedSchoolYear()

  if (!courseId) return []

  const groups = await db.scheduledGroup.findMany({
    where: { courseId, schoolYear: year },
    include: {
      location: { select: { name: true } },
      course: {
        select: {
          title: true,
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year },
                select: { id: true, schoolYear: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: { select: { moduleScheduleId: true } },
        },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: { status: 'NEW' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const holidayDates = await loadHolidayDateKeys(year)
  return groups.map((g) => {
    const { availableSpots, isFull } = computeGroupCapacity(g, holidayDates, now)
    return { ...g, availableSpots, isFull }
  })
}

/**
 * Returns groups for a course in the admin's currently-selected school year
 * (from the school-year switcher cookie). Used by the student detail
 * "add enrollment" and manual create dialogs. Each group's modules include
 * only the schedules for that same school year.
 */
export async function getGroupsForCourseInSelectedYear(courseId: string) {
  await requireAdmin()
  if (!courseId) return []

  const year = await getSelectedSchoolYear()

  const groups = await db.scheduledGroup.findMany({
    where: { courseId, schoolYear: year },
    include: {
      location: { select: { name: true } },
      course: {
        select: {
          title: true,
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year },
                select: { id: true, schoolYear: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: { select: { moduleScheduleId: true } },
        },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: { status: 'NEW' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const holidayDates = await loadHolidayDateKeys(year)
  return groups.map((g) => {
    const { availableSpots, isFull } = computeGroupCapacity(g, holidayDates, now)
    return { ...g, availableSpots, isFull }
  })
}

export async function sendScheduleOptions(
  inquiryId: string,
  groupIds: string[],
): Promise<AdminActionResult> {
  await requireAdmin()

  if (!inquiryId || !groupIds.length) {
    return { success: false, error: 'Nevaljani podaci.' }
  }

  try {
    const inquiry = await db.inquiry.findUnique({
      where: { id: inquiryId },
    })

    if (!inquiry) return { success: false, error: 'Upit nije pronađen.' }
    if (inquiry.status !== 'NEW') {
      return { success: false, error: 'Upit mora biti u statusu "Nova".' }
    }

    const groups = await db.scheduledGroup.findMany({
      where: { id: { in: groupIds } },
      include: { location: true, course: { select: { isCustom: true } } },
    })

    const options = groups.map((g) => ({
      groupName: g.name ?? 'Grupa',
      schedule: formatGroupSchedule({
        isCustom: g.course.isCustom,
        dayOfWeek: g.dayOfWeek,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        startTime: g.startTime,
        endTime: g.endTime,
      }),
      locationName: g.location.name,
    }))

    const childName = `${inquiry.childFirstName} ${inquiry.childLastName}`.trim()

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: inquiry.parentEmail,
        subject: `Dostupni termini za ${childName} – Inovatic`,
        react: ScheduleOptionsEmail({
          parentName: inquiry.parentName,
          childName,
          options,
        }),
      })
    }
  } catch (err) {
    console.error('sendScheduleOptions failed:', err)
    return { success: false, error: 'Greška pri slanju rasporeda.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${inquiryId}`)
  return { success: true }
}
