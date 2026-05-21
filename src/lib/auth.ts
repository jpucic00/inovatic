import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from './db'
import type { UserRole } from '@prisma/client'
import { authConfig } from './auth.config'

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
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt: async ({ token, user }) => {
      // `user` is only set on initial login; subsequent requests hit the TTL
      // branch below. checkedAt persists across requests via the JWT cookie.
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: UserRole }).role
        token.checkedAt = Date.now()
        return token
      }
      const TTL_MS = 60_000
      const checkedAt = (token.checkedAt as number | undefined) ?? 0
      if (Date.now() - checkedAt < TTL_MS) return token
      const userId = token.id as string | undefined
      if (!userId) return null
      try {
        const dbUser = await db.user.findUnique({
          where: { id: userId },
          select: { deletedAt: true, role: true },
        })
        if (!dbUser || dbUser.deletedAt) return null
        token.role = dbUser.role
        token.checkedAt = Date.now()
        return token
      } catch (err) {
        // Transient DB error (e.g. Neon cold start): keep the existing
        // session and re-check on the next 60s cycle. Only a definitive
        // "user gone / soft-deleted" result above invalidates the session.
        console.error('jwt callback DB check failed:', err)
        return token
      }
    },
  },
})
