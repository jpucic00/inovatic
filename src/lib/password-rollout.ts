import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { sendPasswordLinkToAccount } from '@/lib/password-link-send'

/**
 * The one-time mail that ships with the password links (2026-09-29): every
 * admin and teacher gets a setup link, so they stop using the default password
 * they were handed. Those defaults keep working — the mail offers, it does not
 * force.
 *
 * Triggered from `src/instrumentation.ts` on server start, behind the same
 * production gates as the release notes, and made "exactly once" the same way:
 * a `ReleaseAnnouncement` row keyed {@link ROLLOUT_KEY} is INSERTed before the
 * first mail, so a crash restart or a second instance finds the claim taken.
 * The table's key is a free string; `release-announce.ts` only ever looks up
 * the versions listed in `RELEASES`, so this row never reads as a release.
 */

export const ROLLOUT_KEY = 'password-setup-rollout'

/** Placeholder addresses given to teachers created by the workbook importer —
 *  nobody reads them, and a send would only bounce. */
const PLACEHOLDER_DOMAIN = '@teacher.inovatic.local'

function sendThrottleMs(): number {
  return Number(process.env.EMAIL_SEND_THROTTLE_MS ?? 600)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function claim(): Promise<boolean> {
  try {
    await db.releaseAnnouncement.create({ data: { version: ROLLOUT_KEY } })
    return true
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
    throw err
  }
}

type Tally = { sent: number; failed: number }

async function mailStaff(tally: Tally): Promise<void> {
  const staff = await db.user.findMany({
    where: {
      role: { in: ['ADMIN', 'TEACHER'] },
      deletedAt: null,
      // Someone who already chose a password has nothing to set. At the first
      // boot that is nobody; it matters when a failed run is retried later.
      passwordSetAt: null,
      NOT: { email: { endsWith: PLACEHOLDER_DOMAIN } },
    },
    select: { id: true, city: true },
    orderBy: { email: 'asc' },
  })

  const throttle = sendThrottleMs()
  for (const [i, member] of staff.entries()) {
    if (i > 0 && throttle > 0) await sleep(throttle)
    try {
      const res = await sendPasswordLinkToAccount({
        accountId: member.id,
        purpose: 'SETUP',
        createdById: null,
        // Each from their own office, like every other mail they get.
        city: member.city,
        audience: 'STAFF',
      })
      if (res.ok) tally.sent++
      else tally.failed++
    } catch (err) {
      tally.failed++
      console.error(`Password rollout: send to ${member.id} failed:`, err)
    }
  }
}

/**
 * Mails the rollout once. Without `RESEND_API_KEY` it returns BEFORE claiming,
 * for the release announcer's reason: a local boot must never write the
 * receipt that would silence the real send.
 */
export async function sendPasswordRolloutToStaff(): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  if (!(await claim())) return

  const tally: Tally = { sent: 0, failed: 0 }
  try {
    await mailStaff(tally)
  } catch (err) {
    // Hand the claim back only when nobody was reached — a retry then cannot
    // mail anyone twice. Same rule as the release announcer.
    if (tally.sent === 0) {
      await db.releaseAnnouncement.delete({ where: { version: ROLLOUT_KEY } }).catch(() => undefined)
    }
    throw err
  }

  if (tally.sent === 0) {
    await db.releaseAnnouncement.delete({ where: { version: ROLLOUT_KEY } })
    if (tally.failed > 0) {
      console.error(`Password rollout: nobody could be mailed (${tally.failed} failed) — will retry on next start.`)
    }
    return
  }

  // Partial success keeps the claim: anyone missed is sent one by hand — from
  // their teacher page, or `npm run auth:send-password-link` for an admin who
  // has none — which beats everyone else receiving a second one.
  await db.releaseAnnouncement.update({
    where: { version: ROLLOUT_KEY },
    data: { sentCount: tally.sent, failedCount: tally.failed },
  })
  console.info(
    `Password rollout: setup link sent to ${tally.sent} staff member(s)` +
      (tally.failed > 0 ? `, ${tally.failed} failed` : ''),
  )
}
