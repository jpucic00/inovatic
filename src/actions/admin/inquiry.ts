'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { InquiryStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { updateStatusSchema } from '@/lib/validators/admin/inquiry'
import type { AdminActionResult } from '@/lib/action-types'

export type InquiryFilters = {
  status?: InquiryStatus | 'ALL'
  search?: string
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

  const { status, search, page = 1, pageSize = 20 } = filters

  const where = {
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(search
      ? {
          OR: [
            { parentName: { contains: search, mode: 'insensitive' as const } },
            { childName: { contains: search, mode: 'insensitive' as const } },
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

export async function getInquiry(id: string) {
  await requireAdmin()

  return db.inquiry.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true, level: true } },
      scheduledGroup: { include: { location: true } },
      assignedGroup: {
        include: { course: true, location: true },
      },
      groupOptions: {
        include: {
          scheduledGroup: {
            include: { course: true, location: true },
          },
        },
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
