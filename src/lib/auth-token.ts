import type { City, UserRole } from '@prisma/client'
import { db } from './db'
import { countPortalChildren, isSelectableChild } from './portal-children'

const TTL_MS = 60_000

export type TokenClaims = {
  id?: string
  role?: UserRole
  city?: City
  checkedAt?: number
  studentId?: string
  /** `User.sessionVersion` at login; a lower value than the row's = ended. */
  sessionVersion?: number
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
      select: { deletedAt: true, role: true, city: true, sessionVersion: true },
    })
    if (!dbUser || dbUser.deletedAt) return null
    // The password changed since this session signed in — through a link or
    // the change-password page. Every older session ends here, which is what
    // makes "I changed my password" also mean "and nobody else is in". A token
    // from before the column existed reads as 0, the value every row started at.
    if ((token.sessionVersion ?? 0) !== dbUser.sessionVersion) return null
    // A child no longer signs in at all (2026-09-29), so a STUDENT token still
    // alive from before that deploy is ended here rather than left to run out
    // its 30 days.
    if (dbUser.role === 'STUDENT') return null
    // Ejects a parent who was ALREADY logged in when their last child left the
    // active window — the JWT has no maxAge override, so @auth/core's 30-day
    // default would otherwise keep a cookie minted on 31 August valid deep into
    // September. Reuses the same channel that already evicts soft-deleted users
    // above, so the worst case is ~60s of stale access at the rollover.
    //
    // Inside the try on purpose: the deliberate fail-open below must cover it
    // too, or a Neon cold start logs out every family at once. Gated on the
    // freshly-read role so it never costs an admin or teacher a query.
    if (dbUser.role === 'PARENT' && (await countPortalChildren(userId)) === 0) return null
    // The picked child is re-proven every cycle: a child moved to the other
    // parent's account, deleted, or out of every program drops out of this
    // session within ~60s. Only the CLAIM goes — the parent stays logged in and
    // lands back on the picker.
    if (token.studentId && !(await isSelectableChild(userId, token.studentId))) {
      delete token.studentId
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
