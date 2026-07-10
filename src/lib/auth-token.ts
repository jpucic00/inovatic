import type { City, UserRole } from '@prisma/client'
import { db } from './db'

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
