'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { loginSchema, type LoginFormData } from '@/lib/validators/login'

export type LoginActionResult =
  | { success: true }
  | { success: false; error: string }

export async function loginAction(data: LoginFormData): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: 'Pogrešan email ili lozinka.' }
    }
    throw error
  }
}
