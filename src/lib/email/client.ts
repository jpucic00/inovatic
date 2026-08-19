import { Resend } from 'resend'
import type { ReactElement } from 'react'
import type { City } from '@prisma/client'

let resendClient: Resend | null = null

function getResend(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY)
  return resendClient
}

/**
 * Display name on every outgoing email — one association, whichever office
 * sends. The address beside it is what carries the city.
 */
const FROM_NAME = 'Inovatic'

/**
 * The association's monitored inbox — Split's enrollment inbox, the sender and
 * reply-to for everything that has no city, and the recipient of the inbound
 * notifications (e.g. the /stem-edukacija form, whose submissions are never
 * persisted).
 */
export const ASSOCIATION_EMAIL = 'prijave@udruga-inovatic.hr'

/**
 * Šibenik runs its own enrollment inbox — its parents write to and are answered
 * by Šibenik, never Split.
 */
const SIBENIK_EMAIL = 'prijave.sibenik@udruga-inovatic.hr'

/**
 * The inbox that owns a city's enrollment correspondence: where a new upit is
 * announced, what a parent sees in the From line, and where their reply lands.
 * Split keeps the association address, which is also the fallback for
 * association-level mail that belongs to no city.
 */
export function cityInboxEmail(city?: City): string {
  return city === 'SIBENIK' ? SIBENIK_EMAIL : ASSOCIATION_EMAIL
}

/**
 * Low-level transactional send shared by every function in ./senders.
 *
 * No-ops (returns `false`) when `RESEND_API_KEY` is unset — tests and preview
 * builds run without a key, and "no key" must never read as a failure. Note
 * this is NOT a guarantee that local dev sends nothing: a developer's
 * `.env.local` may hold a working key, so anything that mails without a
 * person asking it to (see `src/lib/release-announce.ts`) needs its own gate.
 *
 * The Resend SDK does NOT throw on API-level failures (unverified sender domain,
 * invalid recipient, quota) — it returns them in-band as `{ error }`. We inspect
 * that and THROW, so each caller keeps its own policy (swallow-and-flag for
 * credentials emails, surface-as-failure for schedule options, swallow-and-log
 * for confirmations) instead of a rejected send silently reading as "sent".
 */
export async function sendTransactionalEmail(params: {
  to: string
  subject: string
  react: ReactElement
  /**
   * The tenant this email belongs to. Decides BOTH the From address and the
   * default reply-to, so a Šibenik parent is written to — and answers — the
   * Šibenik office rather than Split. Omitted only for association-level mail
   * that has no city (the /stem-edukacija B2B form, proslave), which stays on
   * the association address. Every address here lives on the one verified
   * Resend sender domain, so routing per city needs no extra verification.
   */
  city?: City
  /** Overrides the city inbox — used by inbound notifications so staff
   * reply straight to the person who submitted the form. */
  replyTo?: string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  const inbox = cityInboxEmail(params.city)
  const result = await getResend().emails.send({
    from: `${FROM_NAME} <${inbox}>`,
    replyTo: params.replyTo ?? inbox,
    to: params.to,
    subject: params.subject,
    react: params.react,
  })
  if (result?.error) {
    throw new Error(`Resend: ${result.error.name} — ${result.error.message}`)
  }
  return true
}
