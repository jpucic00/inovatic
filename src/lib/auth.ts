import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import type { City, UserRole } from '@prisma/client'
import { authConfig } from './auth.config'
import { revalidateTokenClaims, type TokenClaims } from './auth-token'
import { ipFromForwardedFor } from './client-ip'
import { authorizeCredentials } from './credentials-authorize'
import { applyChildSelection } from './portal-children'

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

/**
 * Too many failed logins for this account or from this address in the last 15
 * minutes (`src/lib/credentials-authorize.ts`). Its own code so the form can say
 * so: "wrong password" would only invite the next guess. It reveals nothing
 * about the account — an unknown address is throttled exactly the same way.
 */
class TooManyAttemptsError extends CredentialsSignin {
  code = 'too_many_attempts'
}

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Korisničko ime ili e-mail', type: 'text' },
        password: { label: 'Lozinka', type: 'password' },
      },
      authorize: async (credentials, request) => {
        const result = await authorizeCredentials(
          credentials,
          ipFromForwardedFor(request.headers.get('x-forwarded-for')),
        )
        if (result.ok) return result.user
        if (result.reason === 'NO_ACTIVE_PROGRAM') throw new NoActiveProgramError()
        if (result.reason === 'THROTTLED') throw new TooManyAttemptsError()
        return null
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
