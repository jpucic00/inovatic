import type { Prisma } from '@prisma/client'

/**
 * The canonical "same child" rule: first name + last name + date of birth.
 * Names compare case-insensitively (DB collation); DOB is an exact string match.
 * Shared by student dedup-on-create (`findOrCreateStudent`) and returning-student
 * detection on inquiries so the two can never drift apart.
 */
type ChildIdentity = {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
}

/**
 * Prisma `where` that matches the single existing STUDENT for this identity, or
 * `null` when DOB is missing — name alone is never enough to assert identity, so
 * a DOB-less identity intentionally matches nobody.
 *
 * Matching is intentionally GLOBAL across cities (owner decision 2026-07-10):
 * the same child must never get a second account in the other city. Callers
 * that act on a match are responsible for the cross-city handling — reuse is
 * blocked with an escalation error and the match is surfaced only in masked
 * form, never with the other city's credentials or history.
 */
export function studentIdentityWhere(
  identity: ChildIdentity,
): Prisma.UserWhereInput | null {
  if (!identity.dateOfBirth) return null
  return {
    role: 'STUDENT',
    firstName: { equals: identity.firstName, mode: 'insensitive' },
    lastName: { equals: identity.lastName, mode: 'insensitive' },
    dateOfBirth: identity.dateOfBirth,
  }
}

/**
 * Normalized key for in-memory batch matching (e.g. flagging a page of inquiries
 * against the set of existing students). Lower-cased + trimmed names mirror the
 * DB's case-insensitive comparison; `null` when DOB is missing, matching the
 * "no DOB → no match" rule of `studentIdentityWhere`.
 */
export function identityKey(
  firstName: string,
  lastName: string,
  dateOfBirth?: string | null,
): string | null {
  if (!dateOfBirth) return null
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}|${dateOfBirth}`
}
