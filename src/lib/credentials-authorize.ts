import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { City, UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { unusablePasswordHash } from '@/lib/password'
import { listPortalChildren } from '@/lib/portal-children'
import { clearHits, isRateLimited, recordHit } from '@/lib/rate-limit'

/**
 * The credentials check behind `authorize()` in `src/lib/auth.ts`, kept free of
 * next-auth so the integration tier can run it against a real database. It
 * answers with a result; `auth.ts` turns the refusals into the Auth.js errors.
 */

const WINDOW_MS = 15 * 60 * 1000
/** Failed logins per account per window: a person mistypes a few times, a
 *  password-guessing bot needs thousands. */
export const LOGIN_FAILURES_PER_IDENTIFIER = 5
/** Failed logins per address per window, over every account: stops one bot
 *  walking a list of e-mails, while a school or office sharing an address
 *  still has room for its own typos. */
export const LOGIN_FAILURES_PER_IP = 30

type AuthorizedUser = {
  id: string
  email: string
  name: string
  role: UserRole
  city: City
  studentId: string | null
  sessionVersion: number
}

type CredentialsResult =
  | { ok: true; user: AuthorizedUser }
  | { ok: false; reason: 'INVALID' | 'NO_ACTIVE_PROGRAM' | 'THROTTLED' }

const identifierKey = (identifier: string) => `login:id:${identifier.toLowerCase()}`
const ipKey = (ip: string) => `login:ip:${ip}`

/**
 * Compared against when no account matches, so an unknown e-mail costs what a
 * wrong password costs — a fast refusal would tell a bot which addresses have
 * an account. Made once per process, lazily, at the same bcrypt cost.
 */
let dummyHash: Promise<string> | undefined
const dummyPasswordHash = () => (dummyHash ??= unusablePasswordHash())

/** Counts one failure against both buckets, and logs the moment either locks. */
function recordFailure(identifier: string, ip: string): void {
  const byIdentifier = recordHit(identifierKey(identifier), WINDOW_MS)
  const byIp = recordHit(ipKey(ip), WINDOW_MS)
  // Once, on the failure that crosses the line — a bot hammering a locked
  // account would otherwise write a log line per attempt. The identifier is
  // left out: it is a person's e-mail, and the address is enough to act on.
  if (byIdentifier === LOGIN_FAILURES_PER_IDENTIFIER) {
    console.warn(`[auth] login throttled: ${LOGIN_FAILURES_PER_IDENTIFIER} failures on one account, last from ${ip}`)
  }
  if (byIp === LOGIN_FAILURES_PER_IP) {
    console.warn(`[auth] login throttled: ${LOGIN_FAILURES_PER_IP} failures from ${ip}`)
  }
}

export async function authorizeCredentials(
  credentials: unknown,
  ip: string,
): Promise<CredentialsResult> {
  const parsed = z
    .object({ identifier: z.string().min(1), password: z.string().min(1) })
    .safeParse(credentials)
  // An empty form is not a guess, so it is not counted.
  if (!parsed.success) return { ok: false, reason: 'INVALID' }

  const identifier = parsed.data.identifier.trim()

  // Checked BEFORE the lookup and the hash, so a locked-out bot costs neither.
  // Only failures are counted: the rightful owner signing in normally never
  // gets near the limit, and a lockout lifts on its own 15 minutes after the
  // last counted failure. The price, accepted: someone who knows an address can
  // keep that account locked by failing on purpose — the owner then has to wait
  // it out, or ask the association for a new link.
  if (
    isRateLimited(identifierKey(identifier), LOGIN_FAILURES_PER_IDENTIFIER, WINDOW_MS) ||
    isRateLimited(ipKey(ip), LOGIN_FAILURES_PER_IP, WINDOW_MS)
  ) {
    return { ok: false, reason: 'THROTTLED' }
  }

  const isEmail = z.string().email().safeParse(identifier).success
  // E-mail is matched case-insensitively: a parent types it on a phone that
  // capitalises the first letter, and every stored address is lower-case.
  const user = isEmail
    ? await db.user.findFirst({ where: { email: { equals: identifier, mode: 'insensitive' } } })
    : await db.user.findUnique({ where: { username: identifier } })
  const account = user && !user.deletedAt ? user : null

  const valid = await bcrypt.compare(
    parsed.data.password,
    account?.passwordHash ?? (await dummyPasswordHash()),
  )

  // A child never signs in (2026-09-29): the family's login is the parent
  // e-mail, and the child is picked after it. A username now identifies only
  // the shared classroom login. Both refusals come after the hash so they cost
  // what a wrong password costs, and count like one.
  if (
    !account ||
    !valid ||
    account.role === 'STUDENT' ||
    (!isEmail && account.role !== 'CLASSROOM')
  ) {
    recordFailure(identifier, ip)
    return { ok: false, reason: 'INVALID' }
  }

  // The password was right: this account's earlier typos are forgiven. The IP
  // bucket is not — one working login must not buy a bot a fresh allowance.
  clearHits(identifierKey(identifier))

  // Parents only, and only after the password checks out — an unauthenticated
  // caller must not be able to probe enrollment state. This is the primary gate
  // rather than a guard further in because it is the only place where NO cookie
  // is ever minted, which is what "the credentials do not work" actually means:
  // `/api/download` and the elearning proxy authorise off a session, so
  // anything that lets one exist leaves them reachable.
  let studentId: string | null = null
  if (account.role === 'PARENT') {
    const children = await listPortalChildren(account.id)
    if (children.length === 0) return { ok: false, reason: 'NO_ACTIVE_PROGRAM' }
    // One child needs no picker — the session opens straight on it.
    if (children.length === 1) studentId = children[0].id
  }

  return {
    ok: true,
    user: {
      id: account.id,
      email: account.email,
      name: `${account.firstName} ${account.lastName}`.trim(),
      role: account.role,
      city: account.city,
      studentId,
      sessionVersion: account.sessionVersion,
    },
  }
}
