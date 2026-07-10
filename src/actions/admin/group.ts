'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createGroupSchema, updateGroupSchema } from '@/lib/validators/admin/group'
import type { CreateGroupInput, UpdateGroupInput } from '@/lib/validators/admin/group'
import type { AdminActionResult } from '@/lib/action-types'
import { computeSchoolYear } from '@/lib/school-year'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { archivedYearError, archivedGroupError } from '@/lib/school-year-guard'

type GroupFilters = {
  courseId?: string
  locationId?: string
}

export async function getGroups(filters: GroupFilters = {}) {
  await requireAdmin()

  const year = await getSelectedSchoolYear()

  const where = {
    schoolYear: year,
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
  }

  const groups = await db.scheduledGroup.findMany({
    where,
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
    include: {
      course: {
        select: {
          id: true,
          title: true,
          level: true,
          isCustom: true,
          enrollmentWindows: {
            where: { schoolYear: year },
            select: { enrollmentStart: true, enrollmentEnd: true },
          },
        },
      },
      location: { select: { id: true, name: true } },
      teacherAssignments: { select: { userId: true } },
      _count: {
        select: {
          enrollments: true,
          preferredInquiries: true,
          assignedInquiries: true,
          materials: true,
          studentComments: true,
          galleryImages: true,
        },
      },
    },
  })

  // The signup window now lives per (course, schoolYear); flatten this year's
  // window onto each group row so the table badge shows the inherited window.
  return groups.map((g) => {
    const win = g.course.enrollmentWindows[0] ?? null
    return {
      ...g,
      enrollmentStart: win?.enrollmentStart ?? null,
      enrollmentEnd: win?.enrollmentEnd ?? null,
      teacherIds: g.teacherAssignments.map((a) => a.userId),
    }
  })
}

export async function getGroupDetail(id: string) {
  await requireAdmin()

  // First get the group's school year to filter module schedules
  const groupMeta = await db.scheduledGroup.findUnique({
    where: { id },
    select: { schoolYear: true },
  })
  const year = groupMeta?.schoolYear ?? computeSchoolYear()

  return db.scheduledGroup.findUnique({
    where: { id },
    include: {
      course: {
        include: {
          enrollmentWindows: {
            where: { schoolYear: year },
            select: { enrollmentStart: true, enrollmentEnd: true },
          },
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year },
                select: { id: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
      location: true,
      enrollments: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          moduleEnrollments: {
            include: {
              moduleSchedule: {
                select: {
                  id: true,
                  module: { select: { id: true, title: true, sortOrder: true } },
                },
              },
            },
          },
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

  // A new group always belongs to the currently selected school year.
  const schoolYear = await getSelectedSchoolYear()
  const blocked = archivedYearError(schoolYear)
  if (blocked) return blocked

  const {
    courseId,
    locationId,
    name,
    dateStart,
    dateEnd,
    dayOfWeek,
    startTime,
    endTime,
    maxStudents,
    teacherIds,
  } = parsed.data

  // Trust-boundary guard mirroring the dropdown filter on /admin/grupe: the
  // course must be valid for this year — a global standard program, or a
  // radionica stamped with the selected year. Blocks a crafted request from
  // attaching a stale radionica from another school year.
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { isCustom: true, schoolYear: true },
  })
  if (!course || (course.isCustom && course.schoolYear !== schoolYear)) {
    return { success: false, error: 'Odabrani program ne pripada ovoj školskoj godini.' }
  }

  try {
    await db.$transaction(async (tx) => {
      const group = await tx.scheduledGroup.create({
        data: {
          courseId,
          locationId,
          name: name || null,
          dateStart: dateStart || null,
          dateEnd: dateEnd || null,
          dayOfWeek: dayOfWeek || null,
          startTime,
          endTime,
          schoolYear,
          maxStudents: maxStudents ?? 12,
          // TODO(city PR3): derive from the validated location's city
          city: 'SPLIT',
        },
      })

      if (teacherIds && teacherIds.length > 0) {
        await tx.teacherAssignment.createMany({
          data: teacherIds.map((userId) => ({
            userId,
            scheduledGroupId: group.id,
          })),
          skipDuplicates: true,
        })
      }
    })
  } catch (err) {
    console.error('createGroup failed:', err)
    return { success: false, error: 'Greška pri kreiranju grupe.' }
  }

  revalidatePath('/admin/grupe')
  return { success: true }
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

async function syncTeacherAssignments(
  tx: TxClient,
  groupId: string,
  teacherIds: string[],
): Promise<void> {
  const current = await tx.teacherAssignment.findMany({
    where: { scheduledGroupId: groupId },
    select: { userId: true },
  })
  const currentIds = new Set(current.map((a) => a.userId))
  const nextIds = new Set(teacherIds)

  const toRemove = [...currentIds].filter((uid) => !nextIds.has(uid))
  const toAdd = [...nextIds].filter((uid) => !currentIds.has(uid))

  if (toRemove.length > 0) {
    await tx.teacherAssignment.deleteMany({
      where: { scheduledGroupId: groupId, userId: { in: toRemove } },
    })
  }
  if (toAdd.length > 0) {
    await tx.teacherAssignment.createMany({
      data: toAdd.map((userId) => ({ userId, scheduledGroupId: groupId })),
      skipDuplicates: true,
    })
  }
}

export async function updateGroup(data: UpdateGroupInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateGroupSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, courseId, locationId, name, dateStart, dateEnd, dayOfWeek, startTime, endTime, maxStudents, teacherIds } = parsed.data

  const blocked = await archivedGroupError(id)
  if (blocked) return blocked

  try {
    await db.$transaction(async (tx) => {
      await tx.scheduledGroup.update({
        where: { id },
        data: {
          ...(courseId !== undefined && { courseId }),
          ...(locationId !== undefined && { locationId }),
          ...(name !== undefined && { name: name || null }),
          ...(dateStart !== undefined && { dateStart: dateStart || null }),
          ...(dateEnd !== undefined && { dateEnd: dateEnd || null }),
          ...(dayOfWeek !== undefined && { dayOfWeek: dayOfWeek || null }),
          ...(startTime !== undefined && { startTime: startTime || null }),
          ...(endTime !== undefined && { endTime: endTime || null }),
          ...(maxStudents !== undefined && { maxStudents }),
        },
      })

      if (teacherIds !== undefined) {
        await syncTeacherAssignments(tx, id, teacherIds)
      }
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
    const group = await db.scheduledGroup.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            enrollments: true,
            assignedInquiries: true,
            preferredInquiries: true,
            materials: true,
            studentComments: true,
            galleryImages: true,
          },
        },
      },
    })

    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

    const blocked = archivedYearError(group.schoolYear)
    if (blocked) return blocked

    if (group._count.enrollments > 0) {
      return { success: false, error: 'Grupa ima upisane polaznike i ne može se obrisati.' }
    }
    if (group._count.assignedInquiries > 0 || group._count.preferredInquiries > 0) {
      return { success: false, error: 'Grupa ima povezane upite i ne može se obrisati.' }
    }
    if (group._count.materials > 0) {
      return { success: false, error: 'Grupa ima materijale i ne može se obrisati.' }
    }
    if (group._count.studentComments > 0) {
      return { success: false, error: 'Grupa ima komentare i ne može se obrisati.' }
    }
    if (group._count.galleryImages > 0) {
      return { success: false, error: 'Grupa ima slike u galeriji i ne može se obrisati.' }
    }

    // Teacher assignments cascade-delete automatically
    await db.scheduledGroup.delete({ where: { id } })
  } catch (err) {
    console.error('deleteGroup failed:', err)
    return { success: false, error: 'Greška pri brisanju grupe.' }
  }

  revalidatePath('/admin/grupe')
  return { success: true }
}
