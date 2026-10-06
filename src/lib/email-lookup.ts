import type { Prisma } from '@prisma/client'

/**
 * Case-insensitive e-mail lookup, in two halves because the database half
 * alone is wrong.
 *
 * Prisma compiles `{ equals, mode: 'insensitive' }` to Postgres `ILIKE` and
 * does not escape the value, so it is a PATTERN: `_` matches any one
 * character (and `_` is legal in an e-mail's local part). Left alone,
 * `_vana@x.hr` finds `ivana@x.hr` — every spelling variant is a fresh login
 * throttle bucket for the same account — and `ivan_horvat@x.hr` can resolve to
 * another family's `ivanxhorvat@x.hr`.
 *
 * So the query only narrows the candidates, and {@link pickExactEmail} decides,
 * comparing the whole address case-insensitively in memory. That stays correct
 * whether or not a later Prisma starts escaping the pattern itself.
 */
export function emailCandidatesWhere(email: string): Prisma.UserWhereInput {
  return { email: { equals: email, mode: 'insensitive' } }
}

export function pickExactEmail<T extends { email: string }>(rows: T[], email: string): T | null {
  const wanted = email.toLowerCase()
  return rows.find((row) => row.email.toLowerCase() === wanted) ?? null
}
