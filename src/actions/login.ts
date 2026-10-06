'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { z } from 'zod'
import { db } from '@/lib/db'
import { emailCandidatesWhere, pickExactEmail } from '@/lib/email-lookup'
import { loginSchema, type LoginFormData } from '@/lib/validators/login'
import { clearSchoolYearCookie } from '@/lib/school-year-cookie'
import { portalChoicesFor } from '@/lib/portal-children'
import { landingFor } from '@/lib/portal-landing'

type LoginActionResult =
  | { success: true; destination: string }
  | { success: false; error: string }

const WRONG_CREDENTIALS = 'Pogrešan e-mail ili lozinka.'
/**
 * Deliberately specific, and deliberately different from the wrong-password
 * message: the password WAS right, and a parent told "wrong e-mail or password"
 * would hunt for a typo that does not exist. Yes, this confirms the account
 * exists — accepted, since these parents know it does and the whole point is to
 * tell them why it stopped working.
 */
const TOO_MANY_ATTEMPTS =
  'Previše neuspjelih pokušaja prijave. Pričekajte 15 minuta pa pokušajte ponovno.'
const NO_ACTIVE_PROGRAM =
  'Nijedno vaše dijete trenutno nije upisano u program. Ako mislite da je ovo greška, javite nam se.'

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
      if (code === 'no_active_program') return { success: false, error: NO_ACTIVE_PROGRAM }
      if (code === 'too_many_attempts') return { success: false, error: TOO_MANY_ATTEMPTS }
      return { success: false, error: WRONG_CREDENTIALS }
    }
    throw error
  }

  // Resolved exactly as `authorize()` resolved it, which has just accepted it.
  const identifier = parsed.data.identifier.trim()
  const isEmail = z.string().email().safeParse(identifier).success
  const select = { id: true, role: true, email: true } as const
  const user = isEmail
    ? pickExactEmail(await db.user.findMany({ where: emailCandidatesWhere(identifier), select }), identifier)
    : await db.user.findUnique({ where: { username: identifier }, select })
  if (!user) return { success: false, error: WRONG_CREDENTIALS }

  // One option lands straight on it; more than one — a parent of siblings, a
  // dual-role admin, a teacher whose own child attends — goes through the
  // picker at /portal/odabir, which lists the same choices.
  const destination = landingFor(user.role, await portalChoicesFor(user.id, user.role))

  // Reset the school-year selection so every login lands on the current year.
  await clearSchoolYearCookie()

  return { success: true, destination }
}
