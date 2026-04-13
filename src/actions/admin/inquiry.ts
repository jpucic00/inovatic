'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { InquiryStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { updateStatusSchema } from '@/lib/validators/admin/inquiry'
import type { AdminActionResult } from '@/lib/action-types'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { ScheduleOptionsEmail } from '../../../emails/schedule-options'

export type InquiryFilters = {
  status?: InquiryStatus | 'ALL'
  search?: string
  courseId?: string | 'NONE'
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

export async function getInquiries(
  filters: InquiryFilters = {},
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.inquiry.findMany>>[number]>> {
  await requireAdmin()

  const { status, search, courseId, page = 1, pageSize = 20 } = filters

  const where = {
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(courseId === 'NONE'
      ? { courseId: null }
      : courseId
        ? { courseId }
        : {}),
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

  return { data, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

export async function getInquiryCourses() {
  await requireAdmin()

  return db.course.findMany({
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
          scheduledGroups: {
            where: { isActive: true },
            include: {
              location: true,
              course: {
                select: {
                  title: true,
                  isCustom: true,
                  modules: {
                    orderBy: { sortOrder: 'asc' },
                    select: { id: true, title: true, sortOrder: true, startDate: true, endDate: true },
                  },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      scheduledGroup: { include: { location: true } },
      assignedGroup: {
        include: { course: true, location: true },
      },
    },
  })
}

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateStatusSchema.safeParse({ id, status })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  try {
    await db.inquiry.update({ where: { id }, data: { status } })
  } catch (err) {
    console.error('updateInquiryStatus failed:', err)
    return { success: false, error: 'Greška pri ažuriranju statusa.' }
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

  if (!courseId) return []

  return db.scheduledGroup.findMany({
    where: { courseId, isActive: true },
    include: {
      location: { select: { name: true } },
      course: {
        select: {
          title: true,
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, title: true, sortOrder: true, startDate: true, endDate: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
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
      include: { location: true },
    })

    const options = groups.map((g) => ({
      groupName: g.name ?? 'Grupa',
      dayOfWeek: g.dayOfWeek ?? '',
      startTime: g.startTime ?? '',
      endTime: g.endTime ?? '',
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
