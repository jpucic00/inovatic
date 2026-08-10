import { Resend } from 'resend'
import type { ReactElement } from 'react'
import type { City } from '@prisma/client'

let resendClient: Resend | null = null

function getResend(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY)
  return resendClient
}

/**
 * Sender identity. `EMAIL_FROM` must be a verified sender domain in Resend; the
 * hardcoded value is the production default used when the env var is unset
 * (e.g. local dev / preview). Kept module-private — callers go through senders.
 */
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Inovatic <noreply@udruga-inovatic.hr>'

/**
 * The association's monitored inbox — default reply-to for everything we send,
 * and the recipient of the inbound notifications (e.g. the /stem-edukacija
 * form, whose submissions are never persisted).
 */
export const ASSOCIATION_EMAIL = 'prijave@udruga-inovatic.hr'

/**
 * Šibenik runs its own enrollment inbox — its parents write to and are answered
 * by Šibenik, never Split.
 */
const SIBENIK_EMAIL = 'prijave.sibenik@udruga-inovatic.hr'

/**
 * The inbox that owns a city's enrollment correspondence: where a new upit is
 * announced, and where a parent's reply lands. Split keeps the association
 * address, which is also the fallback for everything that has no city.
 */
export function cityInboxEmail(city: City): string {
  return city === 'SIBENIK' ? SIBENIK_EMAIL : ASSOCIATION_EMAIL
}

/**
 * Low-level transactional send shared by every function in ./senders.
 *
 * No-ops (returns `false`) when `RESEND_API_KEY` is unset — local dev, tests and
 * preview builds run without a key, and "no key" must never read as a failure.
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
  /** Overrides the association inbox — used by inbound notifications so staff
   * reply straight to the person who submitted the form. */
  replyTo?: string
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  const result = await getResend().emails.send({
    from: FROM_EMAIL,
    replyTo: params.replyTo ?? ASSOCIATION_EMAIL,
    to: params.to,
    subject: params.subject,
    react: params.react,
  })
  if (result?.error) {
    throw new Error(`Resend: ${result.error.name} — ${result.error.message}`)
  }
  return true
}
