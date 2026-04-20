'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createGroupSchema, updateGroupSchema } from '@/lib/validators/admin/group'
import type { CreateGroupInput, UpdateGroupInput } from '@/lib/validators/admin/group'
import type { AdminActionResult } from '@/lib/action-types'
import { computeSchoolYear } from '@/lib/school-year'

export type GroupFilters = {
  courseId?: string
  locationId?: string
  schoolYear?: string
}

export async function getGroups(filters: GroupFilters = {}) {
  await requireAdmin()

  const year = filters.schoolYear ?? computeSchoolYear()

  const where = {
    schoolYear: year,
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
  }

  const groups = await db.scheduledGroup.findMany({
    where,
    orderBy: [{ course: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
    include: {
      course: { select: { id: true, title: true, level: true, isCustom: true } },
      location: { select: { id: true, name: true } },
      teacherAssignments: { select: { userId: true } },
      _count: {
        select: {
          enrollments: true,
          preferredInquiries: true,
          assignedInquiries: true,
          materials: true,
          studentComments: true,
        },
      },
    },
  })

  return groups.map((g) => ({
    ...g,
    teacherIds: g.teacherAssignments.map((a) => a.userId),
  }))
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
    teacherIds,
  } = parsed.data

  try {
    await db.$transaction(async (tx) => {
      const group = await tx.scheduledGroup.create({
        data: {
          courseId,
          locationId,
          name: name || null,
          date: date || null,
          dayOfWeek: dayOfWeek || null,
          startTime,
          endTime,
          schoolYear,
          maxStudents: maxStudents ?? 12,
          enrollmentStart: new Date(enrollmentStart),
          enrollmentEnd: new Date(enrollmentEnd),
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

export async function updateGroup(data: UpdateGroupInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateGroupSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, courseId, locationId, name, date, dayOfWeek, startTime, endTime, schoolYear, maxStudents, enrollmentStart, enrollmentEnd, teacherIds } = parsed.data

  try {
    await db.$transaction(async (tx) => {
      await tx.scheduledGroup.update({
        where: { id },
        data: {
          ...(courseId !== undefined && { courseId }),
          ...(locationId !== undefined && { locationId }),
          ...(name !== undefined && { name: name || null }),
          ...(date !== undefined && { date: date || null }),
          ...(dayOfWeek !== undefined && { dayOfWeek: dayOfWeek || null }),
          ...(startTime !== undefined && { startTime: startTime || null }),
          ...(endTime !== undefined && { endTime: endTime || null }),
          ...(schoolYear !== undefined && { schoolYear }),
          ...(maxStudents !== undefined && { maxStudents }),
          ...(enrollmentStart !== undefined && { enrollmentStart: new Date(enrollmentStart) }),
          ...(enrollmentEnd !== undefined && { enrollmentEnd: new Date(enrollmentEnd) }),
        },
      })

      // If teacherIds is explicitly provided, replace the full set of
      // assignments for this group. (Not provided = don't touch them.)
      if (teacherIds !== undefined) {
        const current = await tx.teacherAssignment.findMany({
          where: { scheduledGroupId: id },
          select: { userId: true },
        })
        const currentIds = new Set(current.map((a) => a.userId))
        const nextIds = new Set(teacherIds)

        const toRemove = [...currentIds].filter((uid) => !nextIds.has(uid))
        const toAdd = [...nextIds].filter((uid) => !currentIds.has(uid))

        if (toRemove.length > 0) {
          await tx.teacherAssignment.deleteMany({
            where: {
              scheduledGroupId: id,
              userId: { in: toRemove },
            },
          })
        }
        if (toAdd.length > 0) {
          await tx.teacherAssignment.createMany({
            data: toAdd.map((userId) => ({
              userId,
              scheduledGroupId: id,
            })),
            skipDuplicates: true,
          })
        }
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
          },
        },
      },
    })

    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

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

    // Teacher assignments cascade-delete automatically
    await db.scheduledGroup.delete({ where: { id } })
  } catch (err) {
    console.error('deleteGroup failed:', err)
    return { success: false, error: 'Greška pri brisanju grupe.' }
  }

  revalidatePath('/admin/grupe')
  return { success: true }
}

/** Returns distinct school years present in ScheduledGroup. */
export async function getGroupSchoolYears(): Promise<string[]> {
  await requireAdmin()
  const result = await db.scheduledGroup.findMany({
    select: { schoolYear: true },
    distinct: ['schoolYear'],
    orderBy: { schoolYear: 'desc' },
  })
  return result.map((r) => r.schoolYear)
}
