import type { City, UserRole } from '@prisma/client'
import { db } from './db'
import { activeEnrollmentWhere } from './enrollment-activity'

const TTL_MS = 60_000

export type TokenClaims = {
  id?: string
  role?: UserRole
  city?: City
  checkedAt?: number
}

/**
 * DB-revalidates a JWT's claims on a 60s TTL. Returns null to kill the
 * session (user gone / soft-deleted); otherwise the token, refreshed when the
 * TTL has expired. A token without a city claim (minted before the city
 * column existed) is refreshed immediately regardless of TTL — a
 * `city: undefined` reaching a Prisma where-clause would silently disable
 * tenant filtering.
 */
export async function revalidateTokenClaims<T extends TokenClaims>(token: T): Promise<T | null> {
  const checkedAt = token.checkedAt ?? 0
  if (token.city && Date.now() - checkedAt < TTL_MS) return token
  const userId = token.id
  if (!userId) return null
  try {
    const dbUser = await db.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, role: true, city: true },
    })
    if (!dbUser || dbUser.deletedAt) return null
    // Ejects a student who was ALREADY logged in when their last enrollment left
    // the active window — the JWT has no maxAge override, so @auth/core's 30-day
    // default would otherwise keep a cookie minted on 31 August valid deep into
    // September. Reuses the same channel that already evicts soft-deleted users
    // above, so the worst case is ~60s of stale access at the rollover.
    //
    // Inside the try on purpose: the deliberate fail-open below must cover it
    // too, or a Neon cold start logs out the entire student body at once. Gated
    // on the freshly-read role so it never costs an admin or teacher a query.
    if (dbUser.role === 'STUDENT') {
      const activeEnrollments = await db.enrollment.count({
        where: { userId, ...activeEnrollmentWhere() },
      })
      if (activeEnrollments === 0) return null
    }
    token.role = dbUser.role
    token.city = dbUser.city
    token.checkedAt = Date.now()
    return token
  } catch (err) {
    // Transient DB error (e.g. Neon cold start): keep the existing session
    // and re-check on the next cycle. Only a definitive "user gone /
    // soft-deleted" result above invalidates the session. A legacy token
    // stays city-less on this path — the auth guards fail closed on that.
    console.error('jwt claim revalidation failed:', err)
    return token
  }
}
