import type { Prisma } from '@prisma/client'
import { RETURNING_INQUIRY_LABEL } from '@/lib/inquiry-status'

/**
 * The "ponovni upis" narrowing offered on both admin lists. Three-way in the UI
 * — the absent value is "Svi", so only the two narrowing states are values here.
 */
export const RETURNING_FILTER_VALUES = ['RETURNING', 'NEW'] as const
export type ReturningFilter = (typeof RETURNING_FILTER_VALUES)[number]

export const RETURNING_FILTER_LABELS: Record<ReturningFilter, string> = {
  // Same string the badge carries, so the filter chip and the table cell can
  // never end up calling one thing by two names.
  RETURNING: RETURNING_INQUIRY_LABEL,
  NEW: 'Novi upis',
}

export function parseReturningFilter(
  raw: string | undefined,
): ReturningFilter | undefined {
  return RETURNING_FILTER_VALUES.includes(raw as ReturningFilter)
    ? (raw as ReturningFilter)
    : undefined
}

type YearBearingEnrollment = { schoolYear: string }

/**
 * A student reads as "ponovni upis" for a school year when they are enrolled in
 * THAT year and were also enrolled in some earlier one. Deliberately "any
 * earlier year", not "the year immediately before": a child who did SLR 1, sat
 * a year out and came back is exactly the returning polaznik this marks.
 *
 * Note this is a different derivation from the inquiry marker of the same name
 * (`flagReturningInquiries`, which matches a child's identity against existing
 * accounts) — an upit is returning because the child already has an account,
 * while a student is returning because their own enrollment history says so.
 * They answer the same question at two points in the funnel and are meant to
 * agree, but neither can be expressed in the other's terms: an inquiry has no
 * enrollments, and a student re-enrolled by an admin has no inquiry.
 *
 * School-year labels are `YYYY/YYYY`, so ordering them as strings is exact —
 * which is what lets {@link returningStudentWhere} push the same rule into SQL.
 */
export function isReturningStudent(
  enrollments: readonly YearBearingEnrollment[],
  referenceYear: string,
): boolean {
  let inYear = false
  let earlier = false
  for (const e of enrollments) {
    if (e.schoolYear === referenceYear) inYear = true
    else if (e.schoolYear < referenceYear) earlier = true
  }
  return inYear && earlier
}

/**
 * SQL twin of {@link isReturningStudent} — the filter has to narrow the query
 * itself, or `total` and the page slice would both count rows the table then
 * drops. Keep the two mirrored; a `some`/`none` pair is the whole difference
 * between the two directions.
 *
 * Both directions require enrollment in the reference year, so turning the
 * filter on also narrows the list to that year's students. That is the point:
 * "izvuci sve ponovne upise ove godine" is one question, not two.
 */
export function returningStudentWhere(
  filter: ReturningFilter,
  referenceYear: string,
): Prisma.UserWhereInput {
  return {
    AND: [
      { enrollments: { some: { schoolYear: referenceYear } } },
      filter === 'RETURNING'
        ? { enrollments: { some: { schoolYear: { lt: referenceYear } } } }
        : { enrollments: { none: { schoolYear: { lt: referenceYear } } } },
    ],
  }
}
