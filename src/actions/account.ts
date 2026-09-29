'use server'

import bcrypt from 'bcryptjs'
import { signIn } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import { hashPassword } from '@/lib/password'
import { allowRequest } from '@/lib/rate-limit'
import { PASSWORD_PROBLEM_MESSAGE, passwordProblem } from '@/lib/password-policy'

/** Attempts per account per 15 minutes — the current password is checked here,
 *  so an open session must not become an unlimited guessing oracle for it. */
const ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

/**
 * A staff member changes their own password (owner decision 2026-09-29: staff
 * only — a parent changes theirs through a link, so a stolen weak parent
 * password cannot be used to lock the family out by changing it).
 *
 * The current password is required even inside a session: a session left open
 * on a shared school computer must not be enough to take the account over.
 *
 * Bumping `sessionVersion` ends every OTHER session within a minute. This one
 * is re-issued straight after by signing in with the new password, so the
 * person who just changed it is not thrown out with them.
 */
export async function changeOwnPassword(input: {
  current: string
  password: string
  confirm: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireTeacher()
  if (
    typeof input?.current !== 'string' ||
    typeof input.password !== 'string' ||
    typeof input.confirm !== 'string'
  ) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }
  if (!allowRequest(`pwchange:${session.user.id}`, ATTEMPTS, WINDOW_MS)) {
    return { success: false, error: 'Previše pokušaja. Pričekajte nekoliko minuta.' }
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, passwordHash: true },
  })
  if (!user) return { success: false, error: 'Račun nije pronađen.' }

  if (!(await bcrypt.compare(input.current, user.passwordHash))) {
    return { success: false, error: 'Trenutna lozinka nije točna.' }
  }
  const problem = passwordProblem(input.password, input.confirm, user.email)
  if (problem) return { success: false, error: PASSWORD_PROBLEM_MESSAGE[problem] }
  if (input.password === input.current) {
    return { success: false, error: 'Nova lozinka mora biti drukčija od trenutne.' }
  }

  const passwordHash = await hashPassword(input.password)
  await db.$transaction([
    db.user.update({
      where: { id: session.user.id },
      data: { passwordHash, passwordSetAt: new Date(), sessionVersion: { increment: 1 } },
    }),
    // An unused link mailed earlier would otherwise still reset the password
    // the owner has just chosen.
    db.passwordToken.updateMany({
      where: { userId: session.user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    }),
  ])

  try {
    await signIn('credentials', { identifier: user.email, password: input.password, redirect: false })
  } catch (err) {
    // The change itself stands; at worst this session ends with the others and
    // the person signs in again with the password they just chose.
    console.error('changeOwnPassword: re-issuing the session failed:', err)
  }
  return { success: true }
}
