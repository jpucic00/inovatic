'use server'

import { Prisma, type City } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertGroupInCity } from '@/lib/city-guard'
import type { AdminActionResult } from '@/lib/action-types'
import { archivedYearError } from '@/lib/school-year-guard'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { fromDateKey, toDateKey } from '@/lib/session-dates'
import { formatDateKey } from '@/lib/format'
import { staffChangeDateError, type StaffChange } from '@/lib/session-staff'
import {
  addSessionStaffChangeSchema,
  setAssignmentRoleSchema,
  type AddSessionStaffChangeInput,
  type SetAssignmentRoleInput,
} from '@/lib/validators/admin/session-staff'

/**
 * Staffing a group is admin-only, both the regular roles and the per-termin
 * changes (owner decision 2026-09-23). A teacher only ticks, on Dolazak, who of
 * the resulting staff actually taught.
 */

function revalidateStaffPaths(groupId: string, userIds: (string | null)[]) {
  revalidatePath(`/admin/grupe/${groupId}`)
  revalidatePath(`/nastavnik/grupa/${groupId}`, 'layout')
  revalidatePath('/nastavnik')
  for (const id of userIds) if (id) revalidatePath(`/admin/nastavnici/${id}`)
}

export async function setTeacherAssignmentRole(
  input: SetAssignmentRoleInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  const parsed = setAssignmentRoleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { assignmentId, role } = parsed.data

  try {
    const assignment = await db.teacherAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        userId: true,
        scheduledGroupId: true,
        scheduledGroup: { select: { city: true, schoolYear: true } },
      },
    })
    if (assignment?.scheduledGroup.city !== city) {
      return { success: false, error: 'Dodjela nije pronađena.' }
    }
    const blocked = archivedYearError(assignment.scheduledGroup.schoolYear)
    if (blocked) return blocked

    await db.teacherAssignment.update({ where: { id: assignmentId }, data: { role } })
    revalidateStaffPaths(assignment.scheduledGroupId, [assignment.userId])
    return { success: true }
  } catch (err) {
    console.error('setTeacherAssignmentRole failed:', err)
    return { success: false, error: 'Greška pri promjeni uloge.' }
  }
}

export type GroupStaffChangeRow = StaffChange & { id: string }

/** Every change on the group, oldest termin first — past ones are history. */
export async function getGroupStaffChanges(groupId: string): Promise<GroupStaffChangeRow[]> {
  const { city } = await requireAdminCtx()
  await assertGroupInCity(groupId, city)

  const rows = await db.sessionStaffChange.findMany({
    where: { scheduledGroupId: groupId },
    orderBy: [{ sessionDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      sessionDate: true,
      userId: true,
      role: true,
      replacesUserId: true,
      user: { select: { firstName: true, lastName: true } },
      replaces: { select: { firstName: true, lastName: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    sessionDate: toDateKey(r.sessionDate),
    userId: r.userId,
    name: `${r.user.firstName} ${r.user.lastName}`,
    role: r.role,
    replacesUserId: r.replacesUserId,
    replacesName: r.replaces ? `${r.replaces.firstName} ${r.replaces.lastName}` : null,
  }))
}

type ChangeValidation = {
  groupId: string
  dateKeys: string[]
  userId: string
  role: 'LEAD' | 'ASSISTANT'
  replacesUserId: string | null
}

/**
 * The refusal for a batch of changes, or null when every date can take one.
 * All or nothing: one date that cannot stand refuses the lot, named by date,
 * so an admin never ends up with half a run of termini covered.
 */
async function staffChangeError(
  change: ChangeValidation,
  group: {
    schoolYear: string
    city: City
    dayOfWeek: string | null
    dateStart: string | null
    dateEnd: string | null
  },
): Promise<string | null> {
  const { groupId, dateKeys, userId, role, replacesUserId } = change

  if (replacesUserId === userId) return 'Nastavnik ne može mijenjati samog sebe.'

  // Same pool the regular assignment picker offers: active own-city staff.
  const person = await db.user.findFirst({
    where: { id: userId, role: { in: ['TEACHER', 'ADMIN'] }, deletedAt: null, city: group.city },
    select: { id: true },
  })
  if (!person) return 'Nastavnik nije pronađen.'

  const [holidays, regulars, existing] = await Promise.all([
    loadHolidayDateKeys(group.schoolYear, group.city),
    db.teacherAssignment.findMany({
      where: { scheduledGroupId: groupId },
      select: { userId: true, role: true },
    }),
    db.sessionStaffChange.findMany({
      where: { scheduledGroupId: groupId, sessionDate: { in: dateKeys.map(fromDateKey) } },
      select: { sessionDate: true, userId: true, replacesUserId: true },
    }),
  ])

  if (replacesUserId && !regulars.some((r) => r.userId === replacesUserId)) {
    return 'Zamijenjeni nastavnik nije dodijeljen ovoj grupi.'
  }
  if (!replacesUserId) {
    // An extra that changes nothing — already on the group in the same role.
    const regular = regulars.find((r) => r.userId === userId)
    if (regular && regular.role === role) return 'Nastavnik je već na grupi u toj ulozi.'
  }

  for (const dateKey of dateKeys) {
    const at = (msg: string) => `${formatDateKey(dateKey)}: ${msg}`
    const dateError = staffChangeDateError(group, dateKey, holidays)
    if (dateError) return at(dateError)

    const sameDay = existing.filter((c) => toDateKey(c.sessionDate) === dateKey)
    if (sameDay.some((c) => c.userId === userId)) {
      return at('ovaj nastavnik već ima promjenu na tom terminu.')
    }
    if (replacesUserId) {
      if (sameDay.some((c) => c.replacesUserId === replacesUserId)) {
        return at('taj nastavnik već ima zamjenu na tom terminu.')
      }
      if (sameDay.some((c) => c.userId === replacesUserId)) {
        return at('taj nastavnik na tom terminu već ima drugu promjenu.')
      }
    }
  }
  return null
}

export async function addSessionStaffChange(
  input: AddSessionStaffChangeInput,
): Promise<AdminActionResult> {
  const { session, city } = await requireAdminCtx()
  const parsed = addSessionStaffChangeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const data = parsed.data

  // Outside the try so the notFound() throw is not swallowed.
  await assertGroupInCity(data.scheduledGroupId, city)

  try {
    const group = await db.scheduledGroup.findUniqueOrThrow({
      where: { id: data.scheduledGroupId },
      select: { schoolYear: true, city: true, dayOfWeek: true, dateStart: true, dateEnd: true },
    })
    const blocked = archivedYearError(group.schoolYear)
    if (blocked) return blocked

    const error = await staffChangeError(
      {
        groupId: data.scheduledGroupId,
        dateKeys: data.sessionDates,
        userId: data.userId,
        role: data.role,
        replacesUserId: data.replacesUserId,
      },
      group,
    )
    if (error) return { success: false, error }

    await db.sessionStaffChange.createMany({
      data: data.sessionDates.map((dateKey) => ({
        scheduledGroupId: data.scheduledGroupId,
        sessionDate: fromDateKey(dateKey),
        userId: data.userId,
        role: data.role,
        replacesUserId: data.replacesUserId,
        createdById: session.user.id,
      })),
    })
    revalidateStaffPaths(data.scheduledGroupId, [data.userId, data.replacesUserId])
    return { success: true }
  } catch (err) {
    // Two admins adding the same person to one termin at once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { success: false, error: 'Ovaj nastavnik već ima promjenu na jednom od termina.' }
    }
    console.error('addSessionStaffChange failed:', err)
    return { success: false, error: 'Greška pri dodavanju zamjene.' }
  }
}

/**
 * Removes a change. Hours already booked for that termin stay in
 * TeacherAttendance — the payout record is never rewritten by a schedule edit.
 */
export async function removeSessionStaffChange(changeId: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!changeId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const change = await db.sessionStaffChange.findUnique({
      where: { id: changeId },
      select: {
        userId: true,
        replacesUserId: true,
        scheduledGroupId: true,
        scheduledGroup: { select: { city: true, schoolYear: true } },
      },
    })
    if (change?.scheduledGroup.city !== city) {
      return { success: false, error: 'Promjena nije pronađena.' }
    }
    const blocked = archivedYearError(change.scheduledGroup.schoolYear)
    if (blocked) return blocked

    await db.sessionStaffChange.delete({ where: { id: changeId } })
    revalidateStaffPaths(change.scheduledGroupId, [change.userId, change.replacesUserId])
    return { success: true }
  } catch (err) {
    console.error('removeSessionStaffChange failed:', err)
    return { success: false, error: 'Greška pri uklanjanju zamjene.' }
  }
}
