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
      return { success: false, error: 'Pogrešno korisničko ime ili lozinka.' }
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
  // gets a post-login panel choice instead of an auto-redirect to /admin.
  const showTeacherPanel =
    user.role === 'ADMIN' &&
    (await db.teacherAssignment.count({ where: { userId: user.id } })) > 0

  // Reset the school-year selection so every login lands on the current year.
  await clearSchoolYearCookie()

  return { success: true, role: user.role, showTeacherPanel }
}
