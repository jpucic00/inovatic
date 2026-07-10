import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from './db'
import type { City, UserRole } from '@prisma/client'
import { authConfig } from './auth.config'
import { revalidateTokenClaims, type TokenClaims } from './auth-token'

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
