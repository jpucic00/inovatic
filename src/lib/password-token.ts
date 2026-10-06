import { createHash, randomBytes } from 'node:crypto'
import type { PasswordTokenPurpose, Prisma, UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'

/**
 * One-time "choose your password" links — the only way anybody gets a password
 * since 2026-09-29. There is deliberately no public trigger: a staff action, a
 * campaign or the deploy rollout issues a link, and nothing else can.
 *
 * Why the token is shaped the way it is:
 *  - 32 random bytes: unguessable, so the check needs no slow hash and the
 *    public page can afford to answer "invalid" instantly.
 *  - Stored as SHA-256 only: a database leak hands out no working links.
 *  - One live link per account, but only once the new one has ARRIVED: minting
 *    leaves the earlier links alone, and the caller expires them
 *    (`expireOtherPasswordTokens`) only after the mail carrying the new one was
 *    confirmed sent. Expiring at mint time meant a failed send (Resend outage,
 *    bad key) left the account with no working link at all — a family's
 *    unopened campaign mail read "istekla" after a teacher's resend that never
 *    went out. Expired, not deleted — the rows are what the per-account send
 *    limit counts, so deleting them would reset the limit on every send.
 *  - Spent atomically: the claim is a conditional update, so two tabs submitting
 *    the same link cannot both set a password.
 *
 * Plain module, not a `'use server'` file: these take ids and tokens unguarded.
 */

const PASSWORD_TOKEN_TTL_MS: Record<PasswordTokenPurpose, number> = {
  // Families read these mails days late — a campaign goes out on a weekday and
  // gets opened at the weekend.
  SETUP: 7 * 24 * 60 * 60 * 1000,
  // Sent because someone asked for it just now.
  RESET: 48 * 60 * 60 * 1000,
}

/** How long a link works, in the words the mail uses. Keep in step with the TTLs. */
export const PASSWORD_LINK_VALID_FOR: Record<PasswordTokenPurpose, string> = {
  SETUP: '7 dana',
  RESET: '48 sati',
}

/** Roles a link may set a password for. A child never signs in; the classroom
 *  login's password is managed by migration, never by a link. */
const LINKABLE_ROLES = new Set<UserRole>(['PARENT', 'TEACHER', 'ADMIN'])

export function isLinkableRole(role: UserRole): boolean {
  return LINKABLE_ROLES.has(role)
}

export function hashPasswordToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type Tx = Prisma.TransactionClient

/** Rows older than this are pruned when the account gets a new link — long
 *  past any expiry and past the one-hour send-limit window. */
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Kills every unused link of the account. Expired, never deleted: the per-account
 * send limit counts these rows.
 */
export async function expireLivePasswordTokens(userId: string, tx: Tx = db): Promise<void> {
  const now = new Date()
  await tx.passwordToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  })
}

/**
 * Kills every unused link of the account EXCEPT `keepTokenId` — called once the
 * mail carrying `keepTokenId` was confirmed sent, so the account is never left
 * without a link that reached it. A send that failed calls nothing: the earlier
 * links keep working, and the new one is left as it is, since a "failed" send
 * may still have been delivered.
 */
export async function expireOtherPasswordTokens(
  userId: string,
  keepTokenId: string,
  tx: Tx = db,
): Promise<void> {
  const now = new Date()
  await tx.passwordToken.updateMany({
    where: { userId, id: { not: keepTokenId }, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  })
}

/**
 * Mint a link for `userId` and return the PLAINTEXT token — the caller mails it
 * and drops it. Earlier links are deliberately left working; the caller expires
 * them with `expireOtherPasswordTokens(userId, tokenId)` once the mail is sent.
 */
export async function issuePasswordToken(
  input: { userId: string; purpose: PasswordTokenPurpose; createdById: string | null },
  tx: Tx = db,
): Promise<{ token: string; expiresAt: Date; tokenId: string }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + PASSWORD_TOKEN_TTL_MS[input.purpose])
  const now = new Date()
  await tx.passwordToken.deleteMany({
    where: { userId: input.userId, createdAt: { lt: new Date(now.getTime() - PRUNE_AFTER_MS) } },
  })
  const row = await tx.passwordToken.create({
    data: {
      userId: input.userId,
      tokenHash: hashPasswordToken(token),
      purpose: input.purpose,
      expiresAt,
      createdById: input.createdById,
    },
    select: { id: true },
  })
  return { token, expiresAt, tokenId: row.id }
}

/** How many links were issued for `userId` since `since` — the per-account
 *  send limit reads the table itself, so it survives restarts. */
export async function countRecentPasswordTokens(userId: string, since: Date): Promise<number> {
  return db.passwordToken.count({ where: { userId, createdAt: { gte: since } } })
}

export type PasswordLinkFailure = 'INVALID' | 'EXPIRED' | 'USED'

type PasswordLinkAccount = {
  email: string
  role: UserRole
  purpose: PasswordTokenPurpose
  /** A parent account's children in an active program — what the page names. */
  children: string[]
}

type LoadedToken = {
  id: string
  purpose: PasswordTokenPurpose
  expiresAt: Date
  usedAt: Date | null
  userId: string
  user: { email: string; role: UserRole; deletedAt: Date | null }
}

async function loadToken(token: string): Promise<LoadedToken | null> {
  if (!token || token.length > 128) return null
  return db.passwordToken.findUnique({
    where: { tokenHash: hashPasswordToken(token) },
    select: {
      id: true,
      purpose: true,
      expiresAt: true,
      usedAt: true,
      userId: true,
      user: { select: { email: true, role: true, deletedAt: true } },
    },
  })
}

function failureOf(row: LoadedToken | null, now: Date): PasswordLinkFailure | null {
  if (!row || row.user.deletedAt || !isLinkableRole(row.user.role)) return 'INVALID'
  if (row.usedAt) return 'USED'
  if (row.expiresAt <= now) return 'EXPIRED'
  return null
}

/** What the setup page shows before anything is typed. Spends nothing. */
export async function inspectPasswordToken(
  token: string,
): Promise<{ ok: true; account: PasswordLinkAccount } | { ok: false; reason: PasswordLinkFailure }> {
  const row = await loadToken(token)
  const failure = failureOf(row, new Date())
  if (failure || !row) return { ok: false, reason: failure ?? 'INVALID' }

  // Staff accounts can have children too (a teacher whose own child attends).
  const children = await db.user.findMany({
    where: {
      parentAccountId: row.userId,
      role: 'STUDENT',
      deletedAt: null,
      enrollments: { some: activeEnrollmentWhere() },
    },
    select: { firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  return {
    ok: true,
    account: {
      email: row.user.email,
      role: row.user.role,
      purpose: row.purpose,
      children: children.map((c) => `${c.firstName} ${c.lastName}`.trim()),
    },
  }
}

/**
 * Spend the link and set the password. The caller has already validated the
 * password against the policy. The bcrypt hash is computed only after the
 * token has been found valid, so an invalid token costs a single indexed read.
 *
 * On success the account's other links are gone, `passwordSetAt` is stamped and
 * `sessionVersion` is bumped — every device still signed in on the old password
 * is logged out within a minute.
 */
export async function redeemPasswordToken(
  token: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: PasswordLinkFailure }> {
  const row = await loadToken(token)
  const failure = failureOf(row, new Date())
  if (failure || !row) return { ok: false, reason: failure ?? 'INVALID' }

  const passwordHash = await hashPassword(password)

  return db.$transaction(async (tx) => {
    // The claim: only one caller can move this row from unused to used.
    const claimed = await tx.passwordToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    if (claimed.count !== 1) return { ok: false as const, reason: 'USED' as const }

    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordSetAt: new Date(), sessionVersion: { increment: 1 } },
    })
    // Any other live link for the account dies with this one.
    await expireLivePasswordTokens(row.userId, tx)
    return { ok: true as const, email: row.user.email }
  })
}
