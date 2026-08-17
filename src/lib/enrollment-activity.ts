import type { Prisma } from '@prisma/client'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'

/**
 * Which school years count as "currently in a program" for a student's portal
 * access — the single definition behind the login gate, the token revalidation
 * and every student-facing data read.
 *
 * CURRENT **plus NEXT**. The next year is not a nicety: next year's accounts are
 * created during the summer (`ensureEnrollment` copies `schoolYear` verbatim
 * from the group, and `addEnrollment` explicitly permits a future-year group),
 * and the credentials campaign is run in the same window. A current-year-only
 * rule would refuse every one of those children the moment they used the
 * password they had just been mailed. `getCourseGradeRules` already carries a
 * written warning about exactly this trap.
 *
 * Deliberately NO grace tail after 1 September. A child who has been re-enrolled
 * into the new year is already covered continuously by the next-year arm before
 * the flip; a child who has NOT been re-enrolled losing access on 1 September is
 * precisely the requested behaviour ("Vaš račun više nije dio nijednog
 * programa"). If a grace period is ever wanted, it is one extra entry here.
 */
export function activeSchoolYears(now: Date = new Date()): string[] {
  const current = computeSchoolYear(now)
  return [current, getNextSchoolYear(current)]
}

/**
 * Prisma mirror of {@link activeSchoolYears}.
 *
 * These two MUST stay in sync — the same discipline `isEnrollmentPending` /
 * `pendingEnrollmentWhere` follow in src/lib/payment-status.ts. A unit test
 * asserts they agree, because a drift here means the login gate and the data
 * gates disagree about the same child.
 */
export function activeEnrollmentWhere(now: Date = new Date()): Prisma.EnrollmentWhereInput {
  return { schoolYear: { in: activeSchoolYears(now) } }
}

/** Whether one enrollment's year is inside the active window. */
export function isActiveSchoolYear(schoolYear: string, now: Date = new Date()): boolean {
  return activeSchoolYears(now).includes(schoolYear)
}
