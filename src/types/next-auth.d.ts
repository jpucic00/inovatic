import type { DefaultSession } from 'next-auth'
import type { City, UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      city: City
      /**
       * The child this session is looking at in the portal — set after login
       * (automatically for a parent with one active child, by the picker
       * otherwise) and only ever written after `isSelectableChild` agreed.
       * Null for staff in their panels and for the classroom login.
       */
      studentId: string | null
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
    city: City
    studentId?: string | null
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
    studentId?: string
  }
}
