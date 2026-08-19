import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { sendReleaseNotesEmail } from '@/lib/email'
import { RELEASES, type ReleaseNote } from '@/lib/releases'

/**
 * Announces new app versions to the administrators — the production half of the
 * `/release` workflow. Called once per server start from
 * `src/instrumentation.ts`; Railway boots a fresh process on every deploy, so a
 * pushed release is mailed within seconds of going live, with no cron and no
 * waiting for someone to open a page.
 *
 * The whole design question here is "exactly once", because "on every start" is
 * emphatically not once: a deploy starts a process, a crash restarts it (up to
 * `restartPolicyMaxRetries = 3`), and a scaled service would start several. The
 * answer is a claim in the database — `ReleaseAnnouncement.version` is a primary
 * key, so the INSERT itself is the lock, and it is taken BEFORE the first mail
 * rather than after the last. That ordering is copied deliberately from
 * `EmailCampaignRecipient.sentKey`: claiming afterwards leaves a crash-shaped
 * window in which everyone gets the mail twice.
 *
 * Nothing here is exposed to a request. There is no route, no action and no
 * admin button — a release is announced by pushing it, and by nothing else.
 */

/**
 * How far back a release may be dated and still be mailed.
 *
 * Guards against one specific accident: a database restored from an older
 * backup loses its `ReleaseAnnouncement` rows, which would otherwise make every
 * version in `RELEASES` look unannounced and mail the entire changelog in one
 * go. A release is pushed the same day it is cut, so a month is generous for
 * the real case and still bounds the damage of that one.
 */
const ANNOUNCE_WINDOW_DAYS = 30

/**
 * Re-read per send rather than captured at import, so an integration test can
 * set it to 0 after importing this module. Same reasoning (and same env var) as
 * the bulk campaign's throttle — Resend allows 2 requests a second, and admins
 * are few enough that this costs a second in total.
 */
function sendThrottleMs(): number {
  return Number(process.env.EMAIL_SEND_THROTTLE_MS ?? 600)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isWithinWindow(release: ReleaseNote, now: Date): boolean {
  const released = new Date(`${release.date}T00:00:00Z`)
  if (Number.isNaN(released.getTime())) return false
  const ageDays = (now.getTime() - released.getTime()) / 86_400_000
  return ageDays <= ANNOUNCE_WINDOW_DAYS
}

/**
 * Releases that are in code, recent enough to announce, and have no receipt —
 * oldest first, because two pending at once (released twice before pushing)
 * must reach an inbox in the order they happened.
 */
async function pendingReleases(now: Date): Promise<ReleaseNote[]> {
  const candidates = RELEASES.filter((release) => isWithinWindow(release, now))
  if (candidates.length === 0) return []

  const announced = await db.releaseAnnouncement.findMany({
    where: { version: { in: candidates.map((release) => release.version) } },
    select: { version: true },
  })
  const seen = new Set(announced.map((row) => row.version))

  return candidates
    .filter((release) => !seen.has(release.version))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
}

/**
 * Take the claim. Returns false when another instance got there first — the
 * unique violation is the expected outcome of a race, not an error to report.
 */
async function claim(version: string): Promise<boolean> {
  try {
    await db.releaseAnnouncement.create({ data: { version } })
    return true
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false
    }
    throw err
  }
}

async function announce(release: ReleaseNote): Promise<void> {
  if (!(await claim(release.version))) return

  const admins = await db.user.findMany({
    // Administrators only, and their real `email` — an ADMIN signs in with it,
    // unlike a STUDENT whose `email` is synthetic and must never be mailed.
    where: { role: 'ADMIN', deletedAt: null },
    select: { email: true },
    orderBy: { email: 'asc' },
  })

  let sentCount = 0
  let failedCount = 0
  const throttle = sendThrottleMs()

  for (const [i, admin] of admins.entries()) {
    if (i > 0 && throttle > 0) await sleep(throttle)
    try {
      if (await sendReleaseNotesEmail({ to: admin.email, release })) sentCount++
      else failedCount++
    } catch (err) {
      failedCount++
      console.error(`Release ${release.version}: send to ${admin.email} failed:`, err)
    }
  }

  // Nobody was reached, so nothing can be duplicated by trying again — give the
  // claim back and let the next boot retry. Any partial success keeps it: one
  // admin missing a note is a far smaller problem than the rest being told
  // twice, and a resend would have no way to skip the ones already mailed.
  if (sentCount === 0) {
    await db.releaseAnnouncement.delete({ where: { version: release.version } })
    if (failedCount > 0) {
      console.error(
        `Release ${release.version}: no admin could be mailed (${failedCount} failed) — will retry on next start.`,
      )
    }
    return
  }

  await db.releaseAnnouncement.update({
    where: { version: release.version },
    data: { sentCount, failedCount },
  })
  console.info(
    `Release ${release.version} announced to ${sentCount} admin(s)` +
      (failedCount > 0 ? `, ${failedCount} failed` : ''),
  )
}

/**
 * Mail every release that is in code but not yet in the receipts table.
 *
 * Without `RESEND_API_KEY` this returns before claiming anything. That is the
 * dev, test and preview path, and skipping BEFORE the claim is the point: a
 * local boot must not be able to write a receipt for a version production has
 * never announced, which would silence the real send forever if that database
 * were ever promoted.
 */
export async function announcePendingReleases(now = new Date()): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  for (const release of await pendingReleases(now)) {
    await announce(release)
  }
}
