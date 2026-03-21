'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createGroupSchema, updateGroupSchema } from '@/lib/validators/admin/group'
import type { CreateGroupInput, UpdateGroupInput } from '@/lib/validators/admin/group'
import type { AdminActionResult } from '@/lib/action-types'

export type GroupFilters = {
  courseId?: string
  locationId?: string
  isActive?: boolean
}

export async function getGroups(filters: GroupFilters = {}) {
  await requireAdmin()

  const where = {
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
  }

  return db.scheduledGroup.findMany({
    where,
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
    include: {
      course: { select: { id: true, title: true, level: true, isCustom: true } },
      location: { select: { id: true, name: true } },
      _count: { select: { enrollments: true, preferredInquiries: true } },
    },
  })
}

export async function getGroupDetail(id: string) {
  await requireAdmin()

  return db.scheduledGroup.findUnique({
    where: { id },
    include: {
      course: true,
      location: true,
      enrollments: {
        where: { status: 'ACTIVE' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      teacherAssignments: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  })
}

export async function createGroup(data: CreateGroupInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = createGroupSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const {
    courseId,
    locationId,
    name,
    date,
    dayOfWeek,
    startTime,
    endTime,
    schoolYear,
    maxStudents,
    enrollmentStart,
    enrollmentEnd,
  } = parsed.data

  try {
    await db.scheduledGroup.create({
      data: {
        courseId,
        locationId,
        name: name || null,
        date: date || null,
        dayOfWeek: dayOfWeek || null,
        startTime,
        endTime,
        schoolYear: schoolYear || null,
        maxStudents: maxStudents ?? 12,
        enrollmentStart: enrollmentStart ? new Date(enrollmentStart) : null,
        enrollmentEnd: enrollmentEnd ? new Date(enrollmentEnd) : null,
        isActive: true,
      },
    })
  } catch (err) {
    console.error('createGroup failed:', err)
    return { success: false, error: 'Greška pri kreiranju grupe.' }
  }

  revalidatePath('/admin/grupe')
  return { success: true }
}

export async function updateGroup(data: UpdateGroupInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateGroupSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, courseId, locationId, name, date, dayOfWeek, startTime, endTime, schoolYear, maxStudents, enrollmentStart, enrollmentEnd } = parsed.data

  try {
    await db.scheduledGroup.update({
      where: { id },
      data: {
        ...(courseId !== undefined && { courseId }),
        ...(locationId !== undefined && { locationId }),
        ...(name !== undefined && { name: name || null }),
        ...(date !== undefined && { date: date || null }),
        ...(dayOfWeek !== undefined && { dayOfWeek: dayOfWeek || null }),
        ...(startTime !== undefined && { startTime: startTime || null }),
        ...(endTime !== undefined && { endTime: endTime || null }),
        ...(schoolYear !== undefined && { schoolYear: schoolYear || null }),
        ...(maxStudents !== undefined && { maxStudents }),
        ...(enrollmentStart !== undefined && { enrollmentStart: enrollmentStart ? new Date(enrollmentStart) : null }),
        ...(enrollmentEnd !== undefined && { enrollmentEnd: enrollmentEnd ? new Date(enrollmentEnd) : null }),
      },
    })
  } catch (err) {
    console.error('updateGroup failed:', err)
    return { success: false, error: 'Greška pri ažuriranju grupe.' }
  }

  revalidatePath('/admin/grupe')
  revalidatePath(`/admin/grupe/${id}`)
  return { success: true }
}

export async function deleteGroup(id: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    await db.scheduledGroup.delete({ where: { id } })
  } catch (err) {
    console.error('deleteGroup failed:', err)
    return { success: false, error: 'Greška pri brisanju grupe.' }
  }

  revalidatePath('/admin/grupe')
  return { success: true }
}

export async function toggleGroupActive(id: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const group = await db.scheduledGroup.findUnique({ where: { id } })
    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

    await db.scheduledGroup.update({ where: { id }, data: { isActive: !group.isActive } })
  } catch (err) {
    console.error('toggleGroupActive failed:', err)
    return { success: false, error: 'Greška pri ažuriranju grupe.' }
  }

  revalidatePath('/admin/grupe')
  revalidatePath(`/admin/grupe/${id}`)
  return { success: true }
}
