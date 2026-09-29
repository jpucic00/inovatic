'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertTeacherCanViewStudent } from '@/lib/teacher-guard'
import { assertUserInCity } from '@/lib/city-guard'
import {
  isProfileLinkLimited,
  PROFILE_LINK_LIMIT_PER_HOUR,
  sendPasswordLinkToAccount,
} from '@/lib/password-link-send'

type SendLinkResult = { success: true; email: string } | { success: false; error: string }

const LIMITED = `Poveznica je već poslana ${PROFILE_LINK_LIMIT_PER_HOUR} puta u zadnjih sat vremena. Pokušajte kasnije.`

/**
 * "Pošalji poveznicu za lozinku" on a child's profile → the child's PARENT
 * login. Allowed to anyone who can open that profile (owner decision
 * 2026-09-29: no narrower boundary for teachers) — `assertTeacherCanViewStudent`
 * is that exact check, and it admits same-city admins too.
 *
 * SETUP while the parent has never chosen a password, RESET after. The link
 * sets the password of the whole family login, which the confirmation dialog
 * says before this runs.
 */
export async function sendParentPasswordLink(studentId: string): Promise<SendLinkResult> {
  const { session } = await assertTeacherCanViewStudent(studentId)

  const child = await db.user.findUnique({
    where: { id: studentId },
    select: {
      city: true,
      parentAccount: { select: { id: true, passwordSetAt: true, deletedAt: true } },
    },
  })
  const account = child?.parentAccount
  if (!child || !account || account.deletedAt) {
    return {
      success: false,
      error: 'Dijete nema roditeljski račun. Upišite ispravan e-mail roditelja na profilu.',
    }
  }
  if (await isProfileLinkLimited(account.id)) return { success: false, error: LIMITED }

  const result = await sendPasswordLinkToAccount({
    accountId: account.id,
    purpose: account.passwordSetAt ? 'RESET' : 'SETUP',
    createdById: session.user.id,
    city: child.city,
    audience: 'PARENT',
  })
  if (!result.ok) return { success: false, error: result.error }

  revalidatePath(`/admin/ucenici/${studentId}`)
  revalidatePath(`/nastavnik/ucenik/${studentId}`)
  return { success: true, email: result.email }
}

/**
 * "Pošalji poveznicu za lozinku" on a teacher's profile → the teacher. Admin
 * only, own city only; a cross-city id 404s like everywhere else.
 */
export async function sendStaffPasswordLink(userId: string): Promise<SendLinkResult> {
  const { session, city } = await requireAdminCtx()
  await assertUserInCity(userId, city)

  const staff = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, passwordSetAt: true, deletedAt: true },
  })
  if (!staff || staff.deletedAt || (staff.role !== 'TEACHER' && staff.role !== 'ADMIN')) {
    return { success: false, error: 'Nastavnik nije pronađen.' }
  }
  if (await isProfileLinkLimited(userId)) return { success: false, error: LIMITED }

  const result = await sendPasswordLinkToAccount({
    accountId: userId,
    purpose: staff.passwordSetAt ? 'RESET' : 'SETUP',
    createdById: session.user.id,
    city,
    audience: 'STAFF',
  })
  if (!result.ok) return { success: false, error: result.error }

  revalidatePath(`/admin/nastavnici/${userId}`)
  return { success: true, email: result.email }
}
