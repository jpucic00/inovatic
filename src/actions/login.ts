'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import type { UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { loginSchema, type LoginFormData } from '@/lib/validators/login'

export type LoginActionResult =
  | { success: true; role: UserRole }
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
  const user = identifier.includes('@')
    ? await db.user.findUnique({ where: { email: identifier }, select: { role: true } })
    : await db.user.findUnique({ where: { username: identifier }, select: { role: true } })
  if (!user) return { success: false, error: 'Pogrešno korisničko ime ili lozinka.' }

  return { success: true, role: user.role }
}
