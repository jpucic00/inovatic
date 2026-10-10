import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { City, UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { emailCandidatesWhere, pickExactEmail } from '@/lib/email-lookup'
import { unusablePasswordHash } from '@/lib/password'
import { listPortalChildren } from '@/lib/portal-children'
import { clearHits, isRateLimited, recordHit, releaseHit } from '@/lib/rate-limit'

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

/**
 * Counts the attempt against both buckets BEFORE the lookup and the hash. The
 * check-then-count order is racy: every request of a parallel burst passes
 * `isRateLimited` before the first one gets as far as recording, so 200
 * concurrent guesses would all be tried. Reserving synchronously — no await
 * between the check and this — makes the sixth concurrent attempt see five.
 * An attempt that turns out not to be a failure gives its hits back.
 */
function reserveAttempt(identifier: string, ip: string) {
  const at = Date.now()
  const byIdentifier = recordHit(identifierKey(identifier), WINDOW_MS, at)
  const byIp = recordHit(ipKey(ip), WINDOW_MS, at)
  return {
    /** A wrong password: the reservation stands. Logs once, on the attempt that locks. */
    fail() {
      // A bot hammering a locked account would otherwise write a log line per
      // attempt. The identifier is left out: it is a person's e-mail, and the
      // address is enough to act on.
      if (byIdentifier === LOGIN_FAILURES_PER_IDENTIFIER) {
        console.warn(`[auth] login throttled: ${LOGIN_FAILURES_PER_IDENTIFIER} failures on one account, last from ${ip}`)
      }
      if (byIp === LOGIN_FAILURES_PER_IP) {
        console.warn(`[auth] login throttled: ${LOGIN_FAILURES_PER_IP} failures from ${ip}`)
      }
    },
    /** The password was right: this account's earlier typos are forgiven. The
     *  IP bucket keeps its older failures — one working login must not buy a
     *  bot a fresh allowance — and only this attempt's hit is taken back. */
    succeed() {
      clearHits(identifierKey(identifier))
      releaseHit(ipKey(ip), at)
    },
    /** Neither outcome (the lookup threw): nothing was guessed. */
    cancel() {
      releaseHit(identifierKey(identifier), at)
      releaseHit(ipKey(ip), at)
    },
  }
}

/**
 * The account behind `identifier` and whether `password` opens it. Always
 * pays for one bcrypt compare, so an unknown e-mail costs what a wrong
 * password costs.
 */
async function checkPassword(identifier: string, password: string) {
  const isEmail = z.string().email().safeParse(identifier).success
  // E-mail is matched case-insensitively: a parent types it on a phone that
  // capitalises the first letter. Exact match, not the ILIKE pattern on its
  // own (see email-lookup.ts).
  const user = isEmail
    ? pickExactEmail(await db.user.findMany({ where: emailCandidatesWhere(identifier) }), identifier)
    : await db.user.findUnique({ where: { username: identifier } })
  const account = user && !user.deletedAt ? user : null

  const matches = await bcrypt.compare(password, account?.passwordHash ?? (await dummyPasswordHash()))

  // A child never signs in (2026-09-29): the family's login is the parent
  // e-mail, and the child is picked after it. A username now identifies only
  // the shared classroom login. Both refusals come after the hash so they cost
  // what a wrong password costs, and count like one.
  const mayUse = account !== null && account.role !== 'STUDENT' && (isEmail || account.role === 'CLASSROOM')
  return { account, valid: matches && mayUse }
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

  const attempt = reserveAttempt(identifier, ip)

  let checked: Awaited<ReturnType<typeof checkPassword>>
  try {
    checked = await checkPassword(identifier, parsed.data.password)
  } catch (error) {
    attempt.cancel()
    throw error
  }
  const { account, valid } = checked

  if (!account || !valid) {
    attempt.fail()
    return { ok: false, reason: 'INVALID' }
  }

  attempt.succeed()

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
