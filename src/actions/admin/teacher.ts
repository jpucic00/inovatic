'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { AdminActionResult } from '@/lib/action-types'
import {
  createTeacherSchema,
  updateTeacherSchema,
  assignTeacherSchema,
  type CreateTeacherInput,
  type UpdateTeacherInput,
  type AssignTeacherInput,
} from '@/lib/validators/admin/teacher'
import { hashPassword, generateSimplePassword } from '@/lib/password'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { TeacherCredentialsEmail } from '../../../emails/teacher-credentials'
import type { PaginatedResult } from './inquiry'

export type TeacherRow = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
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

export type TeacherFilters = {
  search?: string
  page?: number
  pageSize?: number
}

export type CreateTeacherResult =
  | { success: true; teacherId: string; password: string; emailSent: boolean }
  | { success: false; error: string }

export type ResetPasswordResult =
  | { success: true; password: string; emailSent: boolean }
  | { success: false; error: string }

export async function getTeachers(
  filters: TeacherFilters = {},
): Promise<PaginatedResult<TeacherRow>> {
  await requireAdmin()

  const { search, page = 1, pageSize = 20 } = filters

  const where = {
    role: 'TEACHER' as const,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
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
  await requireAdmin()
  return db.user.findUnique({
    where: { id, role: 'TEACHER' },
    include: {
      teacherAssignments: {
        include: {
          scheduledGroup: {
            include: {
              course: { select: { id: true, title: true, slug: true } },
              location: { select: { name: true } },
            },
          },
        },
      },
    },
  })
}

/** Used by the "Assign" combobox on the teacher detail page. */
export async function getAssignableGroupsForTeacher(teacherId: string) {
  await requireAdmin()
  const assigned = await db.teacherAssignment.findMany({
    where: { userId: teacherId },
    select: { scheduledGroupId: true },
  })
  const assignedIds = assigned.map((a) => a.scheduledGroupId)

  return db.scheduledGroup.findMany({
    where: { id: { notIn: assignedIds } },
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
  await requireAdmin()
  return db.user.findMany({
    where: { role: 'TEACHER' },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

export async function createTeacher(
  input: CreateTeacherInput,
): Promise<CreateTeacherResult> {
  await requireAdmin()

  const parsed = createTeacherSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const data = parsed.data
  const email = data.email.toLowerCase().trim()

  try {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return { success: false, error: 'Korisnik s tim e-mailom već postoji.' }
    }

    const password = generateSimplePassword(8)
    const passwordHash = await hashPassword(password)

    const user = await db.user.create({
      data: {
        email,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone?.trim() || null,
        role: 'TEACHER',
        passwordHash,
        plainPassword: password,
      },
      select: { id: true },
    })

    let emailSent = false
    if (process.env.RESEND_API_KEY) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          process.env.NEXTAUTH_URL ??
          'https://udruga-inovatic.hr'
        await resend.emails.send({
          from: FROM_EMAIL,
          replyTo: REPLY_TO,
          to: email,
          subject: 'Pristupni podaci – Inovatic',
          react: TeacherCredentialsEmail({
            firstName: data.firstName,
            lastName: data.lastName,
            email,
            password,
            loginUrl: `${baseUrl}/prijava`,
          }),
        })
        emailSent = true
      } catch (err) {
        // Don't fail the account creation if email delivery fails —
        // admin can still read the password from plainPassword in the UI.
        console.error('Failed to send teacher credentials email:', err)
      }
    }

    revalidatePath('/admin/nastavnici')

    return { success: true, teacherId: user.id, password, emailSent }
  } catch (err) {
    console.error('createTeacher failed:', err)
    return { success: false, error: 'Greška pri kreiranju nastavnika.' }
  }
}

export async function updateTeacher(
  input: UpdateTeacherInput,
): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateTeacherSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, firstName, lastName, phone } = parsed.data

  try {
    const teacher = await db.user.findUnique({
      where: { id, role: 'TEACHER' },
      select: { id: true },
    })
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }

    await db.user.update({
      where: { id },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
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

export async function resetTeacherPassword(
  id: string,
): Promise<ResetPasswordResult> {
  await requireAdmin()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const teacher = await db.user.findUnique({
      where: { id, role: 'TEACHER' },
      select: { id: true, email: true, firstName: true, lastName: true },
    })
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }

    const password = generateSimplePassword(8)
    const passwordHash = await hashPassword(password)

    await db.user.update({
      where: { id },
      data: { passwordHash, plainPassword: password },
    })

    let emailSent = false
    if (process.env.RESEND_API_KEY) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          process.env.NEXTAUTH_URL ??
          'https://udruga-inovatic.hr'
        await resend.emails.send({
          from: FROM_EMAIL,
          replyTo: REPLY_TO,
          to: teacher.email,
          subject: 'Nova lozinka – Inovatic',
          react: TeacherCredentialsEmail({
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.email,
            password,
            loginUrl: `${baseUrl}/prijava`,
          }),
        })
        emailSent = true
      } catch (err) {
        console.error('Failed to send teacher reset email:', err)
      }
    }

    revalidatePath(`/admin/nastavnici/${id}`)
    return { success: true, password, emailSent }
  } catch (err) {
    console.error('resetTeacherPassword failed:', err)
    return { success: false, error: 'Greška pri resetiranju lozinke.' }
  }
}

export async function deleteTeacher(id: string): Promise<AdminActionResult> {
  await requireAdmin()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const teacher = await db.user.findUnique({
      where: { id, role: 'TEACHER' },
      select: { id: true },
    })
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }

    // Cascades teacherAssignments automatically (onDelete: Cascade on the join table).
    await db.user.delete({ where: { id } })

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
  await requireAdmin()

  const parsed = assignTeacherSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { teacherId, scheduledGroupId } = parsed.data

  try {
    const [teacher, group] = await Promise.all([
      db.user.findUnique({
        where: { id: teacherId, role: 'TEACHER' },
        select: { id: true },
      }),
      db.scheduledGroup.findUnique({
        where: { id: scheduledGroupId },
        select: { id: true },
      }),
    ])
    if (!teacher) return { success: false, error: 'Nastavnik nije pronađen.' }
    if (!group) return { success: false, error: 'Grupa nije pronađena.' }

    const existing = await db.teacherAssignment.findUnique({
      where: { userId_scheduledGroupId: { userId: teacherId, scheduledGroupId } },
    })
    if (existing) {
      return { success: false, error: 'Nastavnik je već dodijeljen ovoj grupi.' }
    }

    await db.teacherAssignment.create({
      data: { userId: teacherId, scheduledGroupId },
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
  await requireAdmin()
  if (!assignmentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const assignment = await db.teacherAssignment.findUnique({
      where: { id: assignmentId },
      select: { userId: true, scheduledGroupId: true },
    })
    if (!assignment) return { success: false, error: 'Dodjela nije pronađena.' }

    await db.teacherAssignment.delete({ where: { id: assignmentId } })

    revalidatePath(`/admin/nastavnici/${assignment.userId}`)
    revalidatePath(`/admin/grupe/${assignment.scheduledGroupId}`)
    return { success: true }
  } catch (err) {
    console.error('unassignTeacherFromGroup failed:', err)
    return { success: false, error: 'Greška pri uklanjanju dodjele.' }
  }
}
