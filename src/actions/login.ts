'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import type { UserRole } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { loginSchema, type LoginFormData } from '@/lib/validators/login'
import { clearSchoolYearCookie } from '@/lib/school-year-cookie'

type LoginActionResult =
  | { success: true; role: UserRole; showTeacherPanel: boolean }
  | { success: false; error: string }

const WRONG_CREDENTIALS = 'Pogrešno korisničko ime ili lozinka.'
/**
 * Deliberately specific, and deliberately different from the wrong-password
 * message: the password WAS right, and a parent told "wrong username or
 * password" would hunt for a typo that does not exist. Yes, this confirms the
 * account exists — accepted, since these parents know it does and the whole
 * point is to tell them why it stopped working.
 */
const NO_ACTIVE_PROGRAM =
  'Vaš račun više nije dio nijednog programa. Ako mislite da je ovo greška, javite nam se.'

export async function loginAction(data: LoginFormData): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  try {
    await signIn('credentials', {
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      redirect: false,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      // `CredentialsSignin` subclasses carry their own `code`; the base provider
      // failure is 'credentials'. Anything unrecognised falls back to the
      // generic message rather than leaking an internal token.
      const code = (error as { code?: unknown }).code
      return {
        success: false,
        error: code === 'no_active_program' ? NO_ACTIVE_PROGRAM : WRONG_CREDENTIALS,
      }
    }
    throw error
  }

  const { identifier } = parsed.data
  const isEmail = z.string().email().safeParse(identifier).success
  const user = isEmail
    ? await db.user.findUnique({ where: { email: identifier }, select: { id: true, role: true } })
    : await db.user.findUnique({ where: { username: identifier }, select: { id: true, role: true } })
  if (!user) return { success: false, error: 'Pogrešno korisničko ime ili lozinka.' }

  // A dual-role admin (city admin who also teaches, e.g. Slavica in Šibenik)
  // gets a post-login panel choice instead of an auto-redirect to /admin —
  // her landing page is the ambiguous one. Every admin can still reach
  // /nastavnik from the sidebar shortcut.
  const showTeacherPanel =
    user.role === 'ADMIN' &&
    (await db.teacherAssignment.count({ where: { userId: user.id } })) > 0

  // Reset the school-year selection so every login lands on the current year.
  await clearSchoolYearCookie()

  return { success: true, role: user.role, showTeacherPanel }
}
