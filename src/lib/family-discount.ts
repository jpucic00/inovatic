import { normalizeParentEmail } from '@/lib/bulk-email-recipients'

/**
 * "Popust za brata/sestru" — the marker that tells an admin a family qualifies
 * for the 10% the public price band promises, so they can work out what a parent
 * with more than one child with us actually owes.
 *
 * Shown on SLR enrollment cards ONLY. Radionica and natjecateljski payments are
 * deliberately untouched by this: a workshop carries its own family discount (the
 * flat 20 € "drugo dijete" in `radionica-deposit.ts`, quoted in every workshop
 * confirmation e-mail), and the competitive program is settled monthly.
 *
 * It marks, it never prices. `Course.price` is NULL for every SLR program — those
 * figures live in `courses-data.ts` as public catalog copy — so a computed amount
 * here would be the app inventing an invoice out of marketing text. The note says
 * the rule applies and names who it applies with; the arithmetic stays with the
 * person doing the billing.
 *
 * Client-safe: `<FamilyDiscountNote>` renders inside a client tree and imports
 * the copy from here, so the Prisma loader lives in `family-discount-data.ts`.
 * A browser bundle that reaches `@/lib/db` crashes the whole page.
 */
export const FAMILY_DISCOUNT_TITLE = 'Popust za brata/sestru'
export const FAMILY_DISCOUNT_NOTE =
  'Obitelj ostvaruje 10% popusta (druga i svaka sljedeća prijava iz iste obitelji).'

export type FamilySibling = {
  id: string
  firstName: string
  lastName: string
  /** The qualifying programs they attend that year, in a stable order. */
  programTitles: string[]
}

/** School year → the siblings that make that year's SLR enrollments discounted. */
export type FamilyDiscountsByYear = Record<string, FamilySibling[]>

type SiblingCandidate = {
  id: string
  firstName: string
  lastName: string
  parentEmail: string | null
  enrollments: { schoolYear: string; programTitle: string }[]
}

/**
 * The decision itself, kept pure and away from Prisma so the rule can be read
 * and tested on its own.
 *
 * Two things it must get right, both of which are the whole point:
 *
 *   - The match on parent e-mail is EXACT, on the normalized form. The SQL that
 *     feeds it can only afford a `contains` prefilter (older history-workbook
 *     imports left `"Ime Prezime <a@b.hr>"` in the column, which an `equals`
 *     would miss), and `contains` happily matches `ana@x.hr` against a search for
 *     `na@x.hr`. Narrow in SQL, decide here — the same shape
 *     `flagReturningInquiries` uses.
 *   - A DIFFERENT child. One child enrolled in both an SLR program and the
 *     competitive one is not their own sibling, and the caller passes `selfId`
 *     precisely so that case cannot slip through as a second enrollment.
 */
export function groupSiblingsByYear(
  parentEmail: string | null,
  years: readonly string[],
  candidates: readonly SiblingCandidate[],
  selfId: string,
): FamilyDiscountsByYear {
  const email = normalizeParentEmail(parentEmail)
  if (!email || years.length === 0) return {}

  const wanted = new Set(years)
  const byYear: FamilyDiscountsByYear = {}

  for (const candidate of candidates) {
    if (candidate.id === selfId) continue
    if (normalizeParentEmail(candidate.parentEmail) !== email) continue

    // One entry per (sibling, year), carrying every qualifying program they are
    // in that year — an admin reading the note needs to see WHY it fired, and a
    // child can legitimately be in two.
    const titlesByYear = new Map<string, Set<string>>()
    for (const e of candidate.enrollments) {
      if (!wanted.has(e.schoolYear)) continue
      const titles = titlesByYear.get(e.schoolYear) ?? new Set<string>()
      titles.add(e.programTitle)
      titlesByYear.set(e.schoolYear, titles)
    }

    for (const [schoolYear, titles] of titlesByYear) {
      byYear[schoolYear] ??= []
      byYear[schoolYear].push({
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        programTitles: [...titles].sort((a, b) => a.localeCompare(b, 'hr')),
      })
    }
  }

  for (const siblings of Object.values(byYear)) {
    siblings.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'hr'),
    )
  }
  return byYear
}
