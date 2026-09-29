import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from './db'
import type { City, UserRole } from '@prisma/client'
import { authConfig } from './auth.config'
import { revalidateTokenClaims, type TokenClaims } from './auth-token'
import { applyChildSelection, listPortalChildren } from './portal-children'

/**
 * The password was right, but none of this parent's children is in a program
 * any more.
 *
 * Thrown rather than returning `null` so the reason survives to `loginAction`
 * and the parent gets a specific message instead of "wrong password" — which
 * would send them hunting for a typo that isn't there. `CredentialsSignin`
 * subclasses carry a `code`, and @auth/core re-throws anything that is an
 * `AuthError`, so the instance reaches our catch intact.
 *
 * This does reveal that the account exists. Accepted deliberately: the parents
 * concerned know they have an account, and telling them why it stopped
 * working is the entire point of the change.
 */
class NoActiveProgramError extends CredentialsSignin {
  code = 'no_active_program'
}

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Korisničko ime ili e-mail', type: 'text' },
        password: { label: 'Lozinka', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = z
          .object({
            identifier: z.string().min(1),
            password: z.string().min(1),
          })
          .safeParse(credentials)

        if (!parsed.success) return null

        const identifier = parsed.data.identifier.trim()
        const isEmail = z.string().email().safeParse(identifier).success
        // E-mail is matched case-insensitively: a parent types it on a phone
        // that capitalises the first letter, and every stored address is
        // lower-case already.
        const user = isEmail
          ? await db.user.findFirst({ where: { email: { equals: identifier, mode: 'insensitive' } } })
          : await db.user.findUnique({ where: { username: identifier } })

        if (!user) return null
        if (user.deletedAt) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        // A child never signs in (2026-09-29): the family's login is the parent
        // e-mail, and the child is picked after it. A username now identifies
        // only the shared classroom login. Both refusals sit after the hash
        // check so they cost what a wrong password costs.
        if (user.role === 'STUDENT') return null
        if (!isEmail && user.role !== 'CLASSROOM') return null

        // Parents only, and only after the password checks out — an
        // unauthenticated caller must not be able to probe enrollment state.
        // This is the primary gate rather than a guard further in because it is
        // the only place where NO cookie is ever minted, which is what "the
        // credentials do not work" actually means: `/api/download` and the
        // elearning proxy authorise off a session, so anything that lets one
        // exist leaves them reachable.
        let studentId: string | null = null
        if (user.role === 'PARENT') {
          const children = await listPortalChildren(user.id)
          if (children.length === 0) throw new NoActiveProgramError()
          // One child needs no picker — the session opens straight on it.
          if (children.length === 1) studentId = children[0].id
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          role: user.role,
          city: user.city,
          studentId,
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt: async ({ token, user, trigger, session }) => {
      // `user` is only set on initial login; subsequent requests hit the TTL
      // revalidation. checkedAt persists across requests via the JWT cookie.
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: UserRole }).role
        token.city = (user as { city: City }).city
        const studentId = (user as { studentId?: string | null }).studentId
        if (studentId) token.studentId = studentId
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0
        token.checkedAt = Date.now()
        return token
      }
      if (trigger === 'update') {
        await applyChildSelection(token as typeof token & TokenClaims, session)
      }
      // The callback token is @auth/core's loose record shape — narrow it to
      // the claims this app actually stamps on it.
      return revalidateTokenClaims(token as typeof token & TokenClaims)
    },
  },
})
