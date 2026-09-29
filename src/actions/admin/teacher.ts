'use server'

import type { UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertGroupInCity, assertUserInCity } from '@/lib/city-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult, PaginatedResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'
import {
  createTeacherSchema,
  updateTeacherSchema,
  assignTeacherSchema,
  type CreateTeacherInput,
  type UpdateTeacherInput,
  type AssignTeacherInput,
} from '@/lib/validators/admin/teacher'
import { unusablePasswordHash } from '@/lib/password'
import { sendPasswordLinkToAccount } from '@/lib/password-link-send'
import { staffChangeAccessFrom } from '@/lib/session-staff'

type TeacherRow = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: UserRole
  createdAt: Date
  teacherAssignments: {
    id: string
    scheduledGroup: {
      id: string
      name: string | null
      dayOfWeek: string | null
      course: { title: string }
    }
  }[]
}

type TeacherFilters = {
  search?: string
  page?: number
  pageSize?: number
}

type CreateTeacherResult =
  | { success: true; teacherId: string; emailSent: boolean }
  | { success: false; error: string }

export async function getTeachers(
  filters: TeacherFilters = {},
): Promise<PaginatedResult<TeacherRow>> {
  const { city } = await requireAdminCtx()

  const { search, page = 1, pageSize = 20 } = filters

  const where = {
    deletedAt: null,
    city,
    // A city ADMIN who also teaches (Šibenik) belongs in staff management so her
    // groups and work report are reachable; a non-teaching admin never appears.
    // Past hours count as teaching too — her report outlives the assignment.
    OR: [
      { role: 'TEACHER' as const },
      { role: 'ADMIN' as const, teacherAssignments: { some: {} } },
      { role: 'ADMIN' as const, teacherAttendances: { some: {} } },
    ],
    ...(search
      ? {
          AND: [
            {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        teacherAssignments: {
          select: {
            id: true,
            scheduledGroup: {
              select: {
                id: true,
                name: true,
                dayOfWeek: true,
                course: { select: { title: true } },
              },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ])

  return {
    data: data as TeacherRow[],
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  }
}

export async function getTeacher(id: string) {
  const { city } = await requireAdminCtx()
  // Explicit select, never `include`: this row crosses to the client in the RSC
  // payload, and `include` ships every scalar — `passwordHash` with it. Add a
  // field here only when the detail page actually renders it.
  const user = await db.user.findUnique({
    where: { id, role: { in: ['TEACHER', 'ADMIN'] }, deletedAt: null, city },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
      deletedAt: true,
      passwordSetAt: true,
      credentialsSentAt: true,
      _count: { select: { teacherAttendances: true } },
      teacherAssignments: {
        select: {
          id: true,
          role: true,
          scheduledGroup: {
            select: {
              id: true,
              name: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              schoolYear: true,
              course: { select: { id: true, title: true, slug: true } },
              location: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  // An ADMIN is a staff-management row only if she actually teaches — currently
  // assigned, or with hours already booked. A pure admin account stays out.
  if (
    user?.role === 'ADMIN' &&
    user.teacherAssignments.length === 0 &&
    user._count.teacherAttendances === 0
  ) {
    return null
  }
  return user
}

/** Used by the "Assign" combobox on the teacher detail page. */
export async function getAssignableGroupsForTeacher(teacherId: string) {
  const { city } = await requireAdminCtx()
  await assertUserInCity(teacherId, city)
  const assigned = await db.teacherAssignment.findMany({
    where: { userId: teacherId },
    select: { scheduledGroupId: true },
  })
  const assignedIds = assigned.map((a) => a.scheduledGroupId)

  return db.scheduledGroup.findMany({
    where: { id: { notIn: assignedIds }, city },
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      schoolYear: true,
      course: { select: { title: true } },
      location: { select: { name: true } },
    },
    orderBy: [{ schoolYear: 'desc' }, { dayOfWeek: 'asc' }],
  })
}

/** Lightweight teacher list for multi-select widgets. */
export async function getAssignableTeachers() {
  const { city } = await requireAdminCtx()
  // ADMIN included on purpose: a city admin who also teaches (e.g. Šibenik)
  // must be assignable to her own groups.
  return db.user.findMany({
    where: { role: { in: ['TEACHER', 'ADMIN'] }, deletedAt: null, city },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

export async function createTeacher(
  input: CreateTeacherInput,
): Promise<CreateTeacherResult> {
  const { session, city } = await requireAdminCtx()

  const parsed = createTeacherSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const data = parsed.data
  const email = data.email.toLowerCase().trim()

  try {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return { success: false, error: 'Korisnik s tim e-mailom već postoji.' }
    }

    // No password is created for anyone (2026-09-29): the account opens only
    // once the teacher chooses one through the link mailed below.
    const user = await db.user.create({
      data: {
        email,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone?.trim() || null,
        role: 'TEACHER',
        passwordHash: await unusablePasswordHash(),
        city,
      },
      select: { id: true },
    })

    // Swallow-and-flag, like the old credentials mail: the account is already
    // committed, and the admin can resend from the teacher's profile.
    const sent = await sendPasswordLinkToAccount({
      accountId: user.id,
      purpose: 'SETUP',
      createdById: session.user.id,
      city,
      audience: 'STAFF',
    }).catch((err: unknown) => {
      console.error('createTeacher: setup link failed:', err)
      return { ok: false as const, error: '' }
    })

    revalidatePath('/admin/nastavnici')

    return { success: true, teacherId: user.id, emailSent: sent.ok }
  } catch (err) {
    console.error('createTeacher failed:', err)
    return { success: false, error: 'Greška pri kreiranju nastavnika.' }
  }
}

export async function updateTeacher(
  input: UpdateTeacherInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = updateTeacherSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, firstName, lastName, phone } = parsed.data
  const email = parsed.data.email.toLowerCase().trim()

  // Outside the try — the notFound() throw must not be swallowed by the catch.
  await assertUserInCity(id, city)

  try {
    const teacher = await db.user.findUnique({
      where: { id, role: 'TEACHER' },
      select: { id: true },
    })
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }

    // Email is the login identity and is @unique across ALL users (any role or
    // city, including soft-deleted). Block a change that would collide with a
    // different account before the write (the DB constraint is the backstop).
    const emailOwner = await db.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (emailOwner && emailOwner.id !== id) {
      return { success: false, error: 'Korisnik s tim e-mailom već postoji.' }
    }

    await db.user.update({
      where: { id },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        phone: phone?.trim() || null,
      },
    })

    revalidatePath('/admin/nastavnici')
    revalidatePath(`/admin/nastavnici/${id}`)
    return { success: true }
  } catch (err) {
    console.error('updateTeacher failed:', err)
    return { success: false, error: 'Greška pri ažuriranju nastavnika.' }
  }
}

export async function deleteTeacher(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  await assertUserInCity(id, city)

  try {
    const teacher = await db.user.findUnique({
      where: { id, role: 'TEACHER' },
      select: { id: true, deletedAt: true },
    })
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }
    if (teacher.deletedAt) {
      return { success: false, error: 'Nastavnik je već obrisan.' }
    }

    // Their zamjene from today on go too — left behind they would keep a
    // deleted account on the termin (and bookable for hours) while the regular
    // they replace stays off it. Past changes are history and stay.
    await db.$transaction([
      db.teacherAssignment.deleteMany({ where: { userId: id } }),
      db.sessionStaffChange.deleteMany({
        where: { userId: id, sessionDate: { gte: staffChangeAccessFrom(new Date()) } },
      }),
      db.user.update({ where: { id }, data: { deletedAt: new Date() } }),
    ])

    revalidatePath('/admin/nastavnici')
    return { success: true }
  } catch (err) {
    console.error('deleteTeacher failed:', err)
    return { success: false, error: 'Greška pri brisanju nastavnika.' }
  }
}

export async function assignTeacherToGroup(
  input: AssignTeacherInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = assignTeacherSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { teacherId, scheduledGroupId, role } = parsed.data

  // Both must live in the admin's city (which also forces assignee city ===
  // group city). Outside the try so the notFound() throw isn't swallowed.
  await assertUserInCity(teacherId, city)
  await assertGroupInCity(scheduledGroupId, city)

  try {
    const [teacher, group] = await Promise.all([
      db.user.findUnique({
        // ADMIN allowed: a city admin can be a named teacher on her groups.
        where: { id: teacherId, role: { in: ['TEACHER', 'ADMIN'] } },
        select: { id: true },
      }),
      db.scheduledGroup.findUnique({
        where: { id: scheduledGroupId },
        select: { id: true, schoolYear: true },
      }),
    ])
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }
    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

    const blocked = archivedYearError(group.schoolYear)
    if (blocked) return blocked

    const existing = await db.teacherAssignment.findUnique({
      where: { userId_scheduledGroupId: { userId: teacherId, scheduledGroupId } },
    })
    if (existing) {
      return { success: false, error: 'Nastavnik je već dodijeljen ovoj grupi.' }
    }

    await db.teacherAssignment.create({
      data: { userId: teacherId, scheduledGroupId, role },
    })

    revalidatePath(`/admin/nastavnici/${teacherId}`)
    revalidatePath(`/admin/grupe/${scheduledGroupId}`)
    return { success: true }
  } catch (err) {
    console.error('assignTeacherToGroup failed:', err)
    return { success: false, error: 'Greška pri dodjeli grupe.' }
  }
}

export async function unassignTeacherFromGroup(
  assignmentId: string,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!assignmentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const assignment = await db.teacherAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        userId: true,
        scheduledGroupId: true,
        scheduledGroup: { select: { schoolYear: true, city: true } },
      },
    })
    // Cross-city assignments are indistinguishable from nonexistent ones.
    if (assignment?.scheduledGroup.city !== city) {
      return { success: false, error: 'Dodjela nije pronađena.' }
    }

    const blocked = archivedYearError(assignment.scheduledGroup.schoolYear)
    if (blocked) return blocked

    // Safe to remove: the teacher's TeacherAttendance rows for this group stay
    // put, so hours already worked keep counting on the payout report.
    await db.teacherAssignment.delete({ where: { id: assignmentId } })

    revalidatePath(`/admin/nastavnici/${assignment.userId}`)
    revalidatePath(`/admin/grupe/${assignment.scheduledGroupId}`)
    return { success: true }
  } catch (err) {
    console.error('unassignTeacherFromGroup failed:', err)
    return { success: false, error: 'Greška pri uklanjanju dodjele.' }
  }
}
