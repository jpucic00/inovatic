'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { allowRequest } from '@/lib/rate-limit'
import { isFirstTimeChild } from '@/lib/trial-eligibility'

const schema = z.object({
  childFirstName: z.string().trim().min(2).max(100),
  childLastName: z.string().trim().min(2).max(100),
  childDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parentEmail: z.string().trim().email().max(200),
})

type TrialEligibilityInput = z.infer<typeof schema>

/** First hop of `x-forwarded-for` (Railway sets it); unknown clients share a bucket. */
async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_IP = 40

/**
 * Whether this child is a first-timer, i.e. whether the public form may offer
 * them a probni sat. Decided by the same two-tier identity match the "Ponovni
 * upis" badge uses.
 *
 * Only half the question: whether a trial EXISTS for a given group is carried on
 * the group itself (`ActiveGroup.trialDate`), because only the group knows which
 * school year to look the trial week up under. The form needs both.
 *
 * SECURITY NOTE, deliberate and documented: this is an unauthenticated endpoint
 * whose answer reveals that an account matching an exact identity exists. That
 * is accepted for three reasons — the caller must already supply the full name,
 * date of birth AND parent e-mail (data they are claiming to own, and which the
 * inquiry itself requires), the reply is a bare boolean with no account detail,
 * and it is rate-limited per IP. It exists because the owner asked for the offer
 * to be HIDDEN from returning families rather than merely refused, which cannot
 * be done without telling the form something.
 *
 * Never trusted on its own: `submitInquiry` re-runs `isFirstTimeChild` and drops
 * `wantsTrial` for a child it recognises, so a caller who skips or spoofs this
 * gains nothing.
 *
 * Fails CLOSED (no offer) on a rate-limit hit or a malformed payload — a missing
 * offer is a support call, a wrongly-granted one is a free lesson.
 */
export async function checkTrialEligibility(
  input: TrialEligibilityInput,
): Promise<{ eligible: boolean }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { eligible: false }

  const ip = await clientIp()
  if (!allowRequest(`trial:ip:${ip}`, MAX_PER_IP, WINDOW_MS)) {
    return { eligible: false }
  }

  const { childFirstName, childLastName, childDateOfBirth, parentEmail } = parsed.data

  const firstTimer = await isFirstTimeChild({
    firstName: childFirstName,
    lastName: childLastName,
    dateOfBirth: childDateOfBirth,
    parentEmail,
  })
  return { eligible: firstTimer }
}
