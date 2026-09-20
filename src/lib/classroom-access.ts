import type { City, Prisma } from '@prisma/client'
import { computeSchoolYear } from '@/lib/school-year'

/**
 * What the shared classroom login ("Račun za učionicu", `UserRole.CLASSROOM`)
 * is allowed to open: every group of its OWN city in the CURRENT school year.
 *
 * Current year only, by owner decision (2026-09-20) — deliberately narrower
 * than `activeEnrollmentWhere` (current + next). A child enrolled over the
 * summer must be able to log in with the password they were just mailed, but a
 * classroom PC in June has no business offering September's groups. On
 * 1 September the list flips on its own.
 *
 * The account holds no enrollments, so this rule IS its membership: the
 * portal reads, the download route and the program/group lists all spread it
 * and nothing else. A unit test pins the year rule.
 */
export function classroomGroupWhere(
  city: City,
  now: Date = new Date(),
): Prisma.ScheduledGroupWhereInput {
  return { city, schoolYear: computeSchoolYear(now) }
}

const CITY_LABEL: Record<City, string> = { SPLIT: 'Split', SIBENIK: 'Šibenik' }

/** What the portal chrome shows where a child's name would go. */
export function classroomDisplayName(city: City): string {
  return `Račun za učionicu · ${CITY_LABEL[city]}`
}
