/**
 * Per-program signup links.
 *
 * `/upisi` is the public, grade-narrowed catalog. `/upisi/<slug>` is the link
 * you hand to someone whose program is already decided — a returning student
 * moving from SLR 1 to SLR 2 regardless of their razred, or a competitor
 * invited into the Natjecateljski program. It offers that program's termini and
 * nothing else, and it is what re-enrollment invitation e-mails link to.
 *
 * These pages are `noindex` and absent from the sitemap: they would otherwise
 * be thin duplicates of `/upisi` and `/programi/<slug>`.
 */

/** Slug of the competitive program — the one signup link that is never public. */
export const COMPETITION_PROGRAM_SLUG = 'natjecateljski-program'

/** Signup path for a program, e.g. `slr-2` → `/upisi/slr-2`. */
export function signupPathForSlug(slug: string): string {
  return `/upisi/${slug}`
}
