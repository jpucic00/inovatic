'use server'

import { clientIp } from '@/lib/client-ip'
import { allowRequest } from '@/lib/rate-limit'
import { inspectPasswordToken, redeemPasswordToken, type PasswordLinkFailure } from '@/lib/password-token'
import { PASSWORD_PROBLEM_MESSAGE, passwordProblem } from '@/lib/password-policy'

/**
 * The two public endpoints of the password-link flow — the ONLY unauthenticated
 * surface it adds. Neither creates a link, and neither accepts an e-mail: the
 * only input is a 256-bit token, which cannot be guessed, so they cannot be
 * used to probe for accounts or to send mail to anyone.
 *
 * Both are still throttled per IP. Not to stop guessing (pointless at 256
 * bits) but to cap the database load a bot can cause, and bcrypt only ever runs
 * after a token has been found valid.
 */

const WINDOW_MS = 15 * 60 * 1000
/** Reading the page: generous — a parent reloading it on a phone is normal. */
const INSPECT_PER_IP = 30
/** Submitting: a real person needs a handful of tries at most. */
const SUBMIT_PER_IP = 10

const RATE_LIMITED = 'Previše pokušaja. Pričekajte nekoliko minuta i pokušajte ponovno.'

const FAILURE_MESSAGE: Record<PasswordLinkFailure, string> = {
  INVALID: 'Poveznica nije ispravna. Provjerite jeste li je otvorili cijelu iz e-maila.',
  // Also what a superseded link reads as: the newer mail is the one to use.
  EXPIRED:
    'Poveznica je istekla ili vam je u međuvremenu poslana novija. Iskoristite najnoviju ili nam se javite.',
  USED: 'Poveznica je već iskorištena. Ako trebate novu lozinku, javite nam se.',
}

export type PasswordLinkView =
  | {
      ok: true
      email: string
      purpose: 'SETUP' | 'RESET'
      /** A parent's children in an active program, named so the parent knows
       *  which login this is. Empty for staff. */
      children: string[]
    }
  | { ok: false; error: string }

export async function inspectPasswordLink(token: string): Promise<PasswordLinkView> {
  if (typeof token !== 'string') return { ok: false, error: FAILURE_MESSAGE.INVALID }
  if (!allowRequest(`pwlink:inspect:${await clientIp()}`, INSPECT_PER_IP, WINDOW_MS)) {
    return { ok: false, error: RATE_LIMITED }
  }
  const state = await inspectPasswordToken(token)
  if (!state.ok) return { ok: false, error: FAILURE_MESSAGE[state.reason] }
  return {
    ok: true,
    email: state.account.email,
    purpose: state.account.purpose,
    children: state.account.children,
  }
}

export async function setPasswordWithLink(input: {
  token: string
  password: string
  confirm: string
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (
    typeof input?.token !== 'string' ||
    typeof input.password !== 'string' ||
    typeof input.confirm !== 'string'
  ) {
    return { ok: false, error: FAILURE_MESSAGE.INVALID }
  }
  if (!allowRequest(`pwlink:submit:${await clientIp()}`, SUBMIT_PER_IP, WINDOW_MS)) {
    return { ok: false, error: RATE_LIMITED }
  }

  // Read first (cheap, spends nothing) — the policy needs the account's address.
  const state = await inspectPasswordToken(input.token)
  if (!state.ok) return { ok: false, error: FAILURE_MESSAGE[state.reason] }

  const problem = passwordProblem(input.password, input.confirm, state.account.email)
  if (problem) return { ok: false, error: PASSWORD_PROBLEM_MESSAGE[problem] }

  const result = await redeemPasswordToken(input.token, input.password)
  if (!result.ok) return { ok: false, error: FAILURE_MESSAGE[result.reason] }
  return { ok: true, email: result.email }
}
