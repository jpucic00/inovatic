import type { NextAuthConfig } from 'next-auth'
import type { UserRole } from '@prisma/client'

// Edge-safe Auth.js config: shared by middleware (Edge runtime) and auth.ts.
// MUST stay free of Prisma/bcrypt imports — the middleware bundle runs on the
// Edge runtime, which cannot load the Prisma engine. `import type` is erased
// at build time, so the UserRole type import below is safe.
export const authConfig = {
  // Railway sits behind a reverse proxy; Auth.js only auto-trusts the
  // forwarded host on Vercel. Without this, signOut() resolves its redirect
  // against AUTH_URL (localhost) instead of the real request origin.
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [],
  pages: {
    signIn: '/prijava',
  },
  callbacks: {
    session: ({ session, token }) => {
      session.user.id = token.id as string
      session.user.role = token.role as UserRole
      return session
    },
  },
} satisfies NextAuthConfig
