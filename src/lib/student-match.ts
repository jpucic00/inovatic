import type { Prisma } from '@prisma/client'

/**
 * The canonical "same child" rule: first name + last name + date of birth.
 * Shared by student dedup-on-create (`findOrCreateStudent`), the create dialog's
 * returning-student lookup and the "Ponovni upis" marker so the three can never
 * drift apart.
 *
 * Names are compared through {@link identityKey}, which folds whitespace, case,
 * diacritics and Unicode composition — on 2026-09-06 a second upit whose child
 * name carried a trailing space produced a second account for the same child,
 * because the old `ILIKE` comparison tolerated case and nothing else. The DB
 * therefore only narrows CANDIDATES by the exact parts (DOB; parent e-mail for
 * DOB-less imports) and the name is decided in memory, where the rule lives once.
 */
type ChildIdentity = {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  parentEmail?: string | null
}

/** The columns a consumer must select so a row can be keyed. */
type MatchableStudent = {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  parentEmail: string | null
}

/**
 * The form a name is PERSISTED in: NFC, trimmed, internal runs of whitespace
 * collapsed to one space. Applied at account creation and edit — never to the
 * inquiry, which stays exactly as the parent typed it (owner decision).
 */
export function normalizeName(value: string): string {
  return value.normalize('NFC').trim().replaceAll(/\s+/g, ' ')
}

/** Trimmed e-mail for persistence; blank collapses to null. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

/**
 * Comparison form of a name: {@link normalizeName}, lower-cased, diacritics
 * stripped (`Anić` ≡ `Anic`). `đ` has no Unicode decomposition, so it is mapped
 * by hand — every other Croatian letter falls out of NFD + mark removal.
 */
function nameKey(value: string): string {
  return normalizeName(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll('đ', 'd')
}

/**
 * Strict identity key: `name|name|dob`, `null` when DOB is missing — name alone
 * is never enough to assert identity, so a DOB-less identity matches nobody.
 */
export function identityKey(
  firstName: string,
  lastName: string,
  dateOfBirth?: string | null,
): string | null {
  if (!dateOfBirth) return null
  return `${nameKey(firstName)}|${nameKey(lastName)}|${dateOfBirth}`
}

/**
 * Legacy key for DOB-less accounts (the historical-workbook import, which had
 * no dates of birth): child name + parent email. `null` when any part is blank,
 * so a PARTY inquiry can never match by e-mail alone. Only meaningful for a
 * student whose stored DOB is NULL — {@link studentMatchKey} enforces that.
 */
export function legacyIdentityKey(
  firstName: string,
  lastName: string,
  parentEmail?: string | null,
): string | null {
  const email = normalizeEmail(parentEmail)?.toLowerCase()
  const first = nameKey(firstName)
  const last = nameKey(lastName)
  if (!email || !first || !last) return null
  return `${first}|${last}|${email}`
}

/**
 * A stored student is keyed under exactly ONE tier — strict when it has a DOB,
 * legacy when it does not — so the tiers can never claim the same account, and
 * an account healed with a DOB leaves the fuzzy pool for good.
 */
export function studentMatchKey(row: MatchableStudent): string | null {
  return row.dateOfBirth
    ? identityKey(row.firstName, row.lastName, row.dateOfBirth)
    : legacyIdentityKey(row.firstName, row.lastName, row.parentEmail)
}

/** Does this stored student match the identity under either tier? */
export function isIdentityMatch(row: MatchableStudent, identity: ChildIdentity): boolean {
  const key = studentMatchKey(row)
  if (!key) return false
  return (
    key === identityKey(identity.firstName, identity.lastName, identity.dateOfBirth) ||
    key === legacyIdentityKey(identity.firstName, identity.lastName, identity.parentEmail)
  )
}

/**
 * Prisma `where` clauses that fetch every student who COULD match: same DOB
 * (strict tier) or same parent e-mail with no DOB (legacy tier). Deliberately
 * name-free — the name is compared in memory via {@link isIdentityMatch}, since
 * SQL equality would reintroduce the whitespace/diacritic blindness this exists
 * to remove. Empty when the identity can match nobody.
 *
 * Matching is intentionally GLOBAL across cities (owner decision 2026-07-10):
 * the same child must never get a second account in the other city. Callers
 * that act on a match are responsible for the cross-city handling — reuse is
 * blocked with an escalation error and the match is surfaced only in masked
 * form, never with the other city's credentials or history.
 */
export function candidateWheres(identity: ChildIdentity): Prisma.UserWhereInput[] {
  const wheres: Prisma.UserWhereInput[] = []
  if (identity.dateOfBirth) {
    wheres.push({ role: 'STUDENT', dateOfBirth: identity.dateOfBirth })
  }
  const email = normalizeEmail(identity.parentEmail)
  if (email && nameKey(identity.firstName) && nameKey(identity.lastName)) {
    wheres.push({
      role: 'STUDENT',
      dateOfBirth: null,
      parentEmail: { equals: email, mode: 'insensitive' },
    })
  }
  return wheres
}
