import type { Session } from 'next-auth'
import type { City, UserRole } from '@prisma/client'
import { afterAll, afterEach, vi } from 'vitest'

// `auth()` from @/lib/auth is stubbed for the entire integration tier — every
// test gets an unauthenticated session by default; call `mockSession(user)` in
// a test to inject a logged-in role.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(() => Promise.resolve(null)),
}))

import { auth as authImport } from '@/lib/auth'
import { db } from '@/lib/db'

// `auth` is heavily overloaded (no-arg session call, middleware wrapper,
// route-handler wrapper); the `vi.mocked` view of it picks the middleware
// overload. Re-cast to the no-arg shape we actually use here.
const mockedAuth = authImport as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>

type SessionUser = {
  id: string
  email?: string | null
  name?: string | null
  role: UserRole
  /**
   * Tenant city; omit for SPLIT. Pass `null` to simulate a legacy session
   * without a city claim (the auth guards must fail closed on those).
   */
  city?: City | null
}

/**
 * Stub the next request's `auth()` call to return a session for `user`. Pass
 * `null` (or omit) to revert to "no session" — also the state at the start of
 * every test thanks to the `afterEach` reset below.
 */
export function mockSession(user: SessionUser | null = null) {
  if (user === null) {
    mockedAuth.mockResolvedValue(null)
    return
  }
  mockedAuth.mockResolvedValue({
    user: {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role,
      city: user.city === null ? undefined : (user.city ?? 'SPLIT'),
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as Session)
}

afterEach(() => {
  mockedAuth.mockResolvedValue(null)
})

afterAll(async () => {
  await db.$disconnect()
})
