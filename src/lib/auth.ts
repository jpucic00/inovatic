import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from './db'
import type { UserRole } from '@prisma/client'

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
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
        const user = identifier.includes('@')
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
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: UserRole }).role
      }
      return token
    },
    session: ({ session, token }) => {
      session.user.id = token.id as string
      session.user.role = token.role as UserRole
      return session
    },
  },
  pages: {
    signIn: '/prijava',
  },
})
