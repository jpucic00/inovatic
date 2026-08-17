import type { City } from '@prisma/client'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'

/**
 * One child's login details as the credentials e-mail renders them, plus the
 * groups the child currently attends. Nothing internal (ids, hashes) reaches a
 * parent's inbox.
 */
export type CredentialsCard = {
  childName: string
  username: string
  password: string
  groups: CredentialsGroup[]
}

export type CredentialsGroup = {
  /** "SLR 2 – utorkom · Svijet LEGO robotike 2" */
  label: string
  /** "Utorak, 17:00–18:30" or a radionica's date range. */
  schedule: string
  locationName: string
  locationAddress: string
}

// ── The ownership guard ──────────────────────────────────────────────────────

/** What {@link assertCredentialsBelongTo} needs to prove a login may be mailed. */
export type CredentialsOwnership = {
  id: string
  parentEmail: string | null
  city: City
  username: string | null
  plainPassword: string | null
  deletedAt: Date | null
}

type OwnershipVerdict = { ok: true } | { ok: false; reason: string }

/**
 * The last line of defence before a credentials e-mail goes out, and the reason
 * a password cannot reach the wrong parent.
 *
 * The sibling of `assertCardsBelongTo` in src/lib/evaluation-email-cards.ts, and
 * deliberately the same shape — but the stakes are higher: a misdirected report
 * card is embarrassing, a misdirected login is account takeover of a minor's
 * portal account. A recipient row names the account it is owed (`studentIds`),
 * written when the cohort was resolved, possibly minutes or a deploy ago. Rather
 * than trust it, the send re-loads that row and re-derives ownership from the
 * student's CURRENT `parentEmail`.
 *
 * Every failure mode ends in "don't send", never "send anyway": the child
 * deleted, the address corrected mid-send, a cohort row naming someone else's
 * account, or an account that still has no usable password (which would
 * otherwise mail a blank Lozinka line). The admin sees the reason on the
 * campaign detail page and can re-send deliberately.
 *
 * Pure on purpose — the caller does the query, this decides, so the decision is
 * unit-testable without a database.
 */
export function assertCredentialsBelongTo(
  expected: { parentEmail: string; city: City; studentIds: string[] },
  loaded: CredentialsOwnership[],
): OwnershipVerdict {
  // Exactly one: a CREDENTIALS row is one account. A row naming two accounts is
  // a bug upstream, and mailing it would be the merged-secrets case this kind
  // exists to prevent.
  if (expected.studentIds.length !== 1) {
    return { ok: false, reason: 'Nema računa za slanje.' }
  }

  // Set equality, not just a count: proves the loaded rows are exactly the ones
  // the recipient row named, even if the query that fetched them were wrong.
  const wanted = new Set(expected.studentIds)
  const got = new Set(loaded.map((row) => row.id))
  if (wanted.size !== got.size || [...wanted].some((id) => !got.has(id))) {
    return {
      ok: false,
      reason: 'Račun je u međuvremenu izbrisan ili izmijenjen — e-mail nije poslan.',
    }
  }

  for (const row of loaded) {
    if (row.deletedAt) {
      return { ok: false, reason: 'Račun je izbrisan — e-mail nije poslan.' }
    }
    if (normalizeParentEmail(row.parentEmail) !== expected.parentEmail) {
      // Either the parent's address changed after the cohort was written, or
      // this account never belonged to this address. Both mean: stop.
      return {
        ok: false,
        reason:
          'E-mail adresa roditelja se promijenila nakon pripreme slanja — pristupni podaci nisu poslani.',
      }
    }
    if (row.city !== expected.city) {
      return { ok: false, reason: 'Račun pripada drugom gradu — e-mail nije poslan.' }
    }
    // Passwords are minted up front, when the campaign is created. Reaching the
    // send loop without one means that step did not cover this child, and a mail
    // with a blank Lozinka is worse than a reported failure.
    if (!row.username || !row.plainPassword) {
      return {
        ok: false,
        reason: 'Račun nema važeću lozinku — pristupni podaci nisu poslani.',
      }
    }
  }

  return { ok: true }
}
