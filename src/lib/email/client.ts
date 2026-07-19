import { Resend } from 'resend'
import type { ReactElement } from 'react'

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
const REPLY_TO = 'prijave@udruga-inovatic.hr'

/**
 * Low-level transactional send shared by every function in ./senders.
 *
 * No-ops (returns `false`) when `RESEND_API_KEY` is unset — local dev, tests and
 * preview builds run without a key, and "no key" must never read as a failure.
 * On a real Resend rejection it THROWS, so each caller keeps its own policy
 * (swallow-and-flag for credentials emails, surface-as-failure for schedule
 * options, swallow-and-log for confirmations).
 */
export async function sendTransactionalEmail(params: {
  to: string
  subject: string
  react: ReactElement
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  await getResend().emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to: params.to,
    subject: params.subject,
    react: params.react,
  })
  return true
}
