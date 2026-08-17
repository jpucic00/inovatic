import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from './db'
import type { City, UserRole } from '@prisma/client'
import { authConfig } from './auth.config'
import { revalidateTokenClaims, type TokenClaims } from './auth-token'
import { activeEnrollmentWhere } from './enrollment-activity'

/**
 * The password was right, but this child is no longer in any program.
 *
 * Thrown rather than returning `null` so the reason survives to `loginAction`
 * and the parent gets a specific message instead of "wrong password" — which
 * would send them hunting for a typo that isn't there. `CredentialsSignin`
 * subclasses carry a `code`, and @auth/core re-throws anything that is an
 * `AuthError`, so the instance reaches our catch intact.
 *
 * This does reveal that the account exists. Accepted deliberately: the parents
 * concerned know their child had an account, and telling them why it stopped
 * working is the entire point of the change.
 */
class NoActiveProgramError extends CredentialsSignin {
  code = 'no_active_program'
}

export const { handlers, signIn, signOut, auth } = NextAuth({
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

        const { identifier } = parsed.data
        const isEmail = z.string().email().safeParse(identifier).success
        const user = isEmail
          ? await db.user.findUnique({ where: { email: identifier } })
          : await db.user.findUnique({ where: { username: identifier } })

        if (!user) return null
        if (user.deletedAt) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        // Students only, and only after the password checks out — an unauthenticated
        // caller must not be able to probe enrollment state. This is the primary
        // gate rather than a guard further in because it is the only place where
        // NO cookie is ever minted, which is what "the credentials do not work"
        // actually means: `/api/download` and the elearning proxy authorise off a
        // session, so anything that lets one exist leaves them reachable.
        if (user.role === 'STUDENT') {
          const activeEnrollments = await db.enrollment.count({
            where: { userId: user.id, ...activeEnrollmentWhere() },
          })
          if (activeEnrollments === 0) throw new NoActiveProgramError()
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          city: user.city,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt: async ({ token, user }) => {
      // `user` is only set on initial login; subsequent requests hit the TTL
      // revalidation. checkedAt persists across requests via the JWT cookie.
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: UserRole }).role
        token.city = (user as { city: City }).city
        token.checkedAt = Date.now()
        return token
      }
      // The callback token is @auth/core's loose record shape — narrow it to
      // the claims this app actually stamps on it.
      return revalidateTokenClaims(token as typeof token & TokenClaims)
    },
  },
})
