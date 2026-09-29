import type { City, UserRole } from '@prisma/client'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'

/**
 * What a "choose your password" mail renders: the login (an e-mail address),
 * the children it opens, and the one-time link. Nothing internal — no ids, no
 * hashes, and never a password — reaches an inbox.
 */
export type PasswordLinkCard = {
  email: string
  children: { name: string; groups: CredentialsGroup[] }[]
  url: string
  /** "7 dana" / "48 sati" — how long the link works. */
  validFor: string
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

/** A selected child as the guard loads it: the child plus the login linked to it. */
export type PasswordLinkOwnership = {
  id: string
  city: City
  deletedAt: Date | null
  parentAccount: { id: string; email: string; role: UserRole; deletedAt: Date | null } | null
}

type OwnershipVerdict = { ok: true; accountId: string } | { ok: false; reason: string }

const LINKABLE = new Set<UserRole>(['PARENT', 'TEACHER', 'ADMIN'])

/**
 * The last check before a setup-link mail goes out, and why a link cannot
 * reach the wrong inbox.
 *
 * A recipient row names children (`studentIds`) and an address, written when
 * the cohort was resolved — possibly minutes or a deploy ago. In between, a
 * child may have moved to the other parent's account or had its address
 * corrected. So the send re-loads the children and re-derives the ONE account
 * they share from their CURRENT links, and mails only if that account still
 * owns exactly the row's address. Every disagreement is "don't send", never
 * "send anyway"; the admin reads the reason on the campaign page.
 *
 * Pure: the caller loads, this decides.
 */
export function assertPasswordLinkBelongsTo(
  expected: { parentEmail: string; city: City; studentIds: string[] },
  loaded: PasswordLinkOwnership[],
): OwnershipVerdict {
  if (expected.studentIds.length === 0) {
    return { ok: false, reason: 'Nema djece za slanje.' }
  }

  const wanted = new Set(expected.studentIds)
  const got = new Set(loaded.map((row) => row.id))
  if (wanted.size !== got.size || [...wanted].some((id) => !got.has(id))) {
    return { ok: false, reason: 'Dijete je u međuvremenu izbrisano ili izmijenjeno — e-mail nije poslan.' }
  }

  let accountId: string | null = null
  for (const row of loaded) {
    if (row.deletedAt) {
      return { ok: false, reason: 'Dijete je izbrisano — e-mail nije poslan.' }
    }
    if (row.city !== expected.city) {
      return { ok: false, reason: 'Dijete pripada drugom gradu — e-mail nije poslan.' }
    }
    const account = row.parentAccount
    if (!account || account.deletedAt || !LINKABLE.has(account.role)) {
      return { ok: false, reason: 'Dijete više nema roditeljski račun — e-mail nije poslan.' }
    }
    if (normalizeParentEmail(account.email) !== expected.parentEmail) {
      return {
        ok: false,
        reason: 'Dijete je u međuvremenu povezano s drugim roditeljskim računom — e-mail nije poslan.',
      }
    }
    if (accountId !== null && accountId !== account.id) {
      return { ok: false, reason: 'Djeca više ne dijele isti roditeljski račun — e-mail nije poslan.' }
    }
    accountId = account.id
  }

  return accountId ? { ok: true, accountId } : { ok: false, reason: 'Nema računa za slanje.' }
}
