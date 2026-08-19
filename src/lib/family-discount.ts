import type { City, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'
import { hasDatedModules } from '@/lib/program-kind'

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
 */
export const FAMILY_DISCOUNT_TITLE = 'Popust za brata/sestru'
export const FAMILY_DISCOUNT_NOTE =
  'Obitelj ostvaruje 10% popusta (druga i svaka sljedeća prijava iz iste obitelji).'

/**
 * A sibling's enrollment counts toward the discount when it is one of our
 * year-long programs — the SLR ladder or the competitive track. A child whose
 * only enrollment that year is a radionica does NOT unlock it: workshops run
 * their own "drugo dijete" popust, and letting one count here would stack two
 * schemes on the same family.
 */
const QUALIFYING_SIBLING_KINDS: ProgramKind[] = ['STANDARD', 'COMPETITION']

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

/**
 * Which of this student's school years carry a family discount, and who makes
 * each one qualify.
 *
 * Same city only. Split and Šibenik run as separate organizations with separate
 * finances, and an admin cannot open the other city's student anyway — a
 * cross-city name here would be a link that 404s, on a note about money that
 * office does not collect.
 *
 * Lives in a plain module rather than under `src/actions/**`: every export from
 * a `'use server'` file is registered as its own callable Server Action, and this
 * one reads other families' children by e-mail.
 */
export async function findFamilyDiscounts(
  studentId: string,
  city: City,
): Promise<FamilyDiscountsByYear> {
  const student = await db.user.findUnique({
    where: { id: studentId },
    select: {
      parentEmail: true,
      enrollments: {
        select: {
          schoolYear: true,
          scheduledGroup: { select: { course: { select: { kind: true } } } },
        },
      },
    },
  })
  const email = normalizeParentEmail(student?.parentEmail ?? null)
  if (!student || !email) return {}

  // Only the years this child has an SLR enrollment in can render the note, so
  // there is nothing to look up for any other year.
  const years = [
    ...new Set(
      student.enrollments
        .filter((e) => hasDatedModules(e.scheduledGroup.course.kind))
        .map((e) => e.schoolYear),
    ),
  ]
  if (years.length === 0) return {}

  const candidates = await db.user.findMany({
    where: {
      role: 'STUDENT',
      city,
      deletedAt: null,
      id: { not: studentId },
      // Prefilter only — `groupSiblingsByYear` re-normalizes and demands an exact
      // match, which is what keeps `ana@x.hr` out of a search for `na@x.hr`.
      parentEmail: { contains: email, mode: 'insensitive' },
      enrollments: {
        some: {
          schoolYear: { in: years },
          scheduledGroup: { course: { kind: { in: QUALIFYING_SIBLING_KINDS } } },
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      parentEmail: true,
      enrollments: {
        where: {
          schoolYear: { in: years },
          scheduledGroup: { course: { kind: { in: QUALIFYING_SIBLING_KINDS } } },
        },
        select: {
          schoolYear: true,
          scheduledGroup: { select: { course: { select: { title: true } } } },
        },
      },
    },
  })

  return groupSiblingsByYear(
    student.parentEmail,
    years,
    candidates.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      parentEmail: c.parentEmail,
      enrollments: c.enrollments.map((e) => ({
        schoolYear: e.schoolYear,
        programTitle: e.scheduledGroup.course.title,
      })),
    })),
    studentId,
  )
}
