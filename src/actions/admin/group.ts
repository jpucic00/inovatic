'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertGroupInCity } from '@/lib/city-guard'
import type { City } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { createGroupSchema, updateGroupSchema } from '@/lib/validators/admin/group'
import type { CreateGroupInput, UpdateGroupInput } from '@/lib/validators/admin/group'
import type { AdminActionResult } from '@/lib/action-types'
import { computeSchoolYear } from '@/lib/school-year'
import { isRadionica } from '@/lib/program-kind'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { archivedYearError, archivedGroupError } from '@/lib/school-year-guard'

type GroupFilters = {
  courseId?: string
  locationId?: string
}

export async function getGroups(filters: GroupFilters = {}) {
  const { city } = await requireAdminCtx()

  const year = await getSelectedSchoolYear()

  const where = {
    schoolYear: year,
    city,
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
          kind: true,
          // Windows are per (course, schoolYear, city) — only this city's.
          enrollmentWindows: {
            where: { schoolYear: year, city },
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
  const { city } = await requireAdminCtx()
  await assertGroupInCity(id, city)

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
            where: { schoolYear: year, city },
            select: { enrollmentStart: true, enrollmentEnd: true },
          },
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              // Module dates are planned per city — show this city's only.
              schedules: {
                where: { schoolYear: year, city },
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

// The teacher pickers only offer own-city staff, but teacherIds arrive as raw
// ids and land in a createMany — re-verify server-side that every assignee is
// an active TEACHER/ADMIN from the group's own city.
async function invalidAssigneesError(
  teacherIds: string[],
  city: City,
): Promise<AdminActionResult | null> {
  const distinct = [...new Set(teacherIds)]
  const valid = await db.user.count({
    where: {
      id: { in: distinct },
      role: { in: ['TEACHER', 'ADMIN'] },
      city,
      deletedAt: null,
    },
  })
  if (valid !== distinct.length) {
    return { success: false, error: 'Neki od odabranih voditelja ne postoje ili ne pripadaju vašem gradu.' }
  }
  return null
}

export async function createGroup(data: CreateGroupInput): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

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
    select: { kind: true, schoolYear: true, city: true },
  })
  if (!course || (isRadionica(course.kind) && course.schoolYear !== schoolYear)) {
    return { success: false, error: 'Odabrani program ne pripada ovoj školskoj godini.' }
  }
  // Shared standard programs (city = null) are open to both cities; a
  // radionica is venue-bound and must belong to the admin's own city.
  if (course.city && course.city !== city) {
    return { success: false, error: 'Odabrani program ne pripada vašem gradu.' }
  }

  // Friendly pre-check of the composite (locationId, city) FK: the venue must
  // exist and sit in the admin's own city; the group inherits that city.
  const location = await db.location.findUnique({
    where: { id: locationId },
    select: { city: true },
  })
  if (location?.city !== city) {
    return { success: false, error: 'Odabrana lokacija ne pripada vašem gradu.' }
  }

  if (teacherIds && teacherIds.length > 0) {
    const invalid = await invalidAssigneesError(teacherIds, city)
    if (invalid) return invalid
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
          city: location.city,
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
    // TeacherAttendance is keyed on (user, group, date), never on the
    // assignment — hours already worked survive this.
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
  const { city } = await requireAdminCtx()

  const parsed = updateGroupSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, courseId, locationId, name, dateStart, dateEnd, dayOfWeek, startTime, endTime, maxStudents, teacherIds } = parsed.data

  await assertGroupInCity(id, city)

  const blocked = await archivedGroupError(id)
  if (blocked) return blocked

  // A group's city is fixed at creation (mirrors the composite (locationId,
  // city) FK): moving it to the other city's venue is not a thing.
  if (locationId !== undefined) {
    const location = await db.location.findUnique({
      where: { id: locationId },
      select: { city: true },
    })
    if (location?.city !== city) {
      return { success: false, error: 'Odabrana lokacija ne pripada vašem gradu.' }
    }
  }

  if (courseId !== undefined) {
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: { city: true },
    })
    if (!course || (course.city && course.city !== city)) {
      return { success: false, error: 'Odabrani program ne pripada vašem gradu.' }
    }
  }

  if (teacherIds !== undefined && teacherIds.length > 0) {
    const invalid = await invalidAssigneesError(teacherIds, city)
    if (invalid) return invalid
  }

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
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  await assertGroupInCity(id, city)

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
            studentAssessments: true,
            galleryImages: true,
            teacherAttendances: true,
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
    if (group._count.studentAssessments > 0) {
      return { success: false, error: 'Grupa ima ocjene i ne može se obrisati.' }
    }
    if (group._count.galleryImages > 0) {
      return { success: false, error: 'Grupa ima slike u galeriji i ne može se obrisati.' }
    }
    // Reachable with an empty roster: bulkMarkSession books the teacher's hours
    // even when no student is enrolled, and those hours are payout evidence.
    if (group._count.teacherAttendances > 0) {
      return {
        success: false,
        error: 'Grupa ima evidentirane sate rada nastavnika i ne može se obrisati.',
      }
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
