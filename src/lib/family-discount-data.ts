import type { City, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'
import { groupSiblingsByYear, type FamilyDiscountsByYear } from '@/lib/family-discount'
import { hasDatedModules } from '@/lib/program-kind'

/**
 * A sibling's enrollment counts toward the discount when it is one of our
 * year-long programs — the SLR ladder or the competitive track. A child whose
 * only enrollment that year is a radionica does NOT unlock it: workshops run
 * their own "drugo dijete" popust, and letting one count here would stack two
 * schemes on the same family.
 */
const QUALIFYING_SIBLING_KINDS: ProgramKind[] = ['STANDARD', 'COMPETITION']

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
