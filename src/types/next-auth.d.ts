import type { DefaultSession } from 'next-auth'
import type { City, UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      city: City
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
    city: City
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    // Absent on tokens minted before the city claim existed; the jwt
    // callback force-refreshes those regardless of the TTL.
    city?: City
    checkedAt?: number
  }
}
