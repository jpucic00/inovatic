/**
 * Per-program signup links.
 *
 * `/prijava` is the public, grade-narrowed catalog. `/prijava/<slug>` is the link
 * you hand to someone whose program is already decided — a returning student
 * moving from SLR 1 to SLR 2 regardless of their razred, or a competitor
 * invited into the Natjecateljski program. It offers that program's termini and
 * nothing else, and it is what re-enrollment invitation e-mails link to.
 *
 * These pages are `noindex` and absent from the sitemap: they would otherwise
 * be thin duplicates of `/prijava` and `/programi/<slug>`.
 */

import type { ProgramKind } from '@prisma/client'
import { isRadionica } from './program-kind'

/** Slug of the competitive program — the one signup link that is never public. */
export const COMPETITION_PROGRAM_SLUG = 'natjecateljski-program'

/** Signup path for a program, e.g. `slr-2` → `/prijava/slr-2`. */
export function signupPathForSlug(slug: string): string {
  return `/prijava/${slug}`
}

/**
 * The public page an admin sends a parent for this program — what every
 * "Kopiraj URL za upise" button copies.
 *
 * A radionica is deliberately absent from `/prijava/<slug>` (that route answers
 * `notFound()` for RADIONICA): its own `/radionice/<slug>` page already carries
 * the marketing copy and the signup form, and routing its signups through a
 * second URL would split them. Everything else — the SLR ladder and the
 * competitive program — signs up at `/prijava/<slug>`.
 *
 * The rule lives here because both the program list and the program detail
 * header copy this link, and a detail page that built `/prijava/<slug>` for a
 * radionica handed the admin a 404.
 */
export function publicSignupPath(kind: ProgramKind, slug: string): string {
  return isRadionica(kind) ? `/radionice/${slug}` : signupPathForSlug(slug)
}
