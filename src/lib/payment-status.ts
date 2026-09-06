import type { Prisma, ProgramKind } from '@prisma/client'
import { isMonthlyBilled, isRadionica } from '@/lib/program-kind'

export type PaymentStatus = 'PAID' | 'PENDING' | 'NOT_DUE' | 'NONE'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: 'Plaćeno',
  PENDING: 'Nije plaćeno',
  NOT_DUE: 'Nije dospjelo',
  NONE: 'Bez upisa',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PAID: 'bg-green-100 text-green-800 border-green-200',
  PENDING: 'bg-red-100 text-red-800 border-red-200',
  // Amber, not red: nothing is owed yet, so nobody is chased over it — but it
  // is not settled either, so it must not read as green.
  NOT_DUE: 'bg-amber-100 text-amber-800 border-amber-200',
  NONE: 'bg-gray-100 text-gray-500 border-gray-200',
}

// Ascending sort puts debtors (PENDING) first, then the other unpaid state —
// the two open ones cluster at the top, settled ones below.
export const PAYMENT_STATUS_SORT_KEY: Record<PaymentStatus, number> = {
  PENDING: 0,
  NOT_DUE: 1,
  PAID: 2,
  NONE: 3,
}

// NONE is deliberately absent: it means "no enrollment in the reference year",
// which the year-scoped students list can never show. Every other state is
// offered, so the filter and the badge share one vocabulary.
export const PAYMENT_FILTER_VALUES = ['PENDING', 'NOT_DUE', 'PAID'] as const
export type PaymentFilter = (typeof PAYMENT_FILTER_VALUES)[number]

export type PaymentStatusEnrollment = {
  schoolYear: string
  fullYearPaidAt: Date | null
  scheduledGroup: { course: { kind: ProgramKind } }
  moduleEnrollments: {
    paidAt: Date | null
    moduleSchedule: { startDate: Date | null }
  }[]
  /** Monthly-fee rows. Empty for every kind except COMPETITION. */
  enrollmentMonths: {
    paidAt: Date | null
    periodStart: Date
  }[]
}

/**
 * Asks about ONE enrollment, and so knows nothing about school years — which
 * years count is the caller's question, and `computeStudentPaymentStatus` asks
 * only about the one being looked at. An enrollment is "pending" (still owes
 * money) when it is not marked whole-year-paid AND, per program kind:
 *
 *   RADIONICA   always — the enrollment itself is the single payable item.
 *   COMPETITION at least one month whose 1st has passed is unpaid. This is what
 *               makes the status flip on the 1st with no scheduled job.
 *   STANDARD    at least one started, unpaid module. A module is "started" once
 *               its window has begun (startDate <= now); a NULL startDate is
 *               treated as started/owed.
 *
 * MUST stay in sync with `pendingEnrollmentWhere` below.
 */
export function isEnrollmentPending(
  enrollment: PaymentStatusEnrollment,
  now: Date,
): boolean {
  if (enrollment.fullYearPaidAt) return false
  const kind = enrollment.scheduledGroup.course.kind
  if (isRadionica(kind)) return true
  if (isMonthlyBilled(kind)) {
    return enrollment.enrollmentMonths.some(
      (m) => m.paidAt === null && m.periodStart <= now,
    )
  }
  return enrollment.moduleEnrollments.some(
    (me) =>
      me.paidAt === null &&
      (me.moduleSchedule.startDate === null || me.moduleSchedule.startDate <= now),
  )
}

/**
 * Has this enrollment produced anything payable yet — paid or not? Same three
 * billing models as {@link isEnrollmentPending}, with the paid/unpaid test
 * dropped: what is asked here is whether the clock has started, not who owes.
 *
 * A `fullYearPaidAt` mark counts on its own. An admin settling the whole year up
 * front is a payment whatever the calendar says, and without this arm a
 * paid-in-advance child would read as though nothing had happened yet.
 *
 * This is what separates the two ways of owing nothing: an enrollment with
 * something due and settled is `PAID`, one with nothing due yet is `NOT_DUE`.
 * Before this existed both read `PAID`, so a whole cohort enrolled in a year
 * that had not started yet showed green in a column nobody had paid into.
 *
 * MUST stay in sync with `dueEnrollmentWhere` below.
 */
export function hasDueItems(enrollment: PaymentStatusEnrollment, now: Date): boolean {
  if (enrollment.fullYearPaidAt) return true
  const kind = enrollment.scheduledGroup.course.kind
  if (isRadionica(kind)) return true
  if (isMonthlyBilled(kind)) {
    return enrollment.enrollmentMonths.some((m) => m.periodStart <= now)
  }
  return enrollment.moduleEnrollments.some(
    (me) => me.moduleSchedule.startDate === null || me.moduleSchedule.startDate <= now,
  )
}

/**
 * Every state is decided INSIDE `referenceYear`. Enrollments from other years are
 * dropped first, then:
 *   1. nothing left            -> NONE
 *   2. owes something          -> PENDING
 *   3. something has come due  -> PAID
 *   4. else                    -> NOT_DUE
 *
 * `referenceYear` is the year the caller is LOOKING AT, not `computeSchoolYear()`.
 * The two part company every summer: upisi for the year starting in September run
 * while today's date still names the year that is ending, and keying on today
 * made every child enrolled for the coming year read "Bez upisa" — the same trap
 * `getCourseGradeRules` documents.
 *
 * PENDING used to be cross-year, so that a debt followed a family. That was
 * reversed on 2026-09-06: `/admin/ucenici` shows one year's rows, and a badge
 * turning a row red over a year the table is not showing is the one way this
 * column can lie — the same reason the list stopped being all-kids. The accepted
 * cost is that last year's debt is invisible until the sidebar year is switched
 * back to it.
 */
export function computeStudentPaymentStatus(
  enrollments: PaymentStatusEnrollment[],
  referenceYear: string,
  now: Date,
): PaymentStatus {
  const inYear = enrollments.filter((e) => e.schoolYear === referenceYear)
  if (inYear.length === 0) return 'NONE'
  if (inYear.some((e) => isEnrollmentPending(e, now))) return 'PENDING'
  return inYear.some((e) => hasDueItems(e, now)) ? 'PAID' : 'NOT_DUE'
}

/**
 * Prisma mirror of `isEnrollmentPending` (year-blind — the caller adds the year,
 * exactly like `dueEnrollmentWhere`). MUST stay in sync.
 */
export function pendingEnrollmentWhere(now: Date): Prisma.EnrollmentWhereInput {
  return {
    fullYearPaidAt: null,
    OR: [
      { scheduledGroup: { course: { kind: 'RADIONICA' } } },
      {
        scheduledGroup: { course: { kind: 'COMPETITION' } },
        enrollmentMonths: { some: { paidAt: null, periodStart: { lte: now } } },
      },
      {
        moduleEnrollments: {
          some: {
            paidAt: null,
            moduleSchedule: {
              OR: [{ startDate: null }, { startDate: { lte: now } }],
            },
          },
        },
      },
    ],
  }
}

/**
 * Prisma mirror of `hasDueItems` (year-independent — the caller adds the year).
 * MUST stay in sync.
 */
export function dueEnrollmentWhere(now: Date): Prisma.EnrollmentWhereInput {
  return {
    OR: [
      { fullYearPaidAt: { not: null } },
      { scheduledGroup: { course: { kind: 'RADIONICA' } } },
      {
        scheduledGroup: { course: { kind: 'COMPETITION' } },
        enrollmentMonths: { some: { periodStart: { lte: now } } },
      },
      {
        moduleEnrollments: {
          some: {
            moduleSchedule: {
              OR: [{ startDate: null }, { startDate: { lte: now } }],
            },
          },
        },
      },
    ],
  }
}

/**
 * User-level where for the students list payment filter — the SQL twin of
 * `computeStudentPaymentStatus`, so the dropdown and the badge can never
 * disagree about a row. Every clause carries `referenceYear`, because every
 * state the badge can show is now decided inside that one year.
 *
 *   PENDING -> owes something in referenceYear
 *   PAID    -> owes nothing there, and something in referenceYear has come due
 *   NOT_DUE -> owes nothing there, enrolled in it, nothing has come due
 */
export function paymentStatusUserWhere(
  filter: PaymentFilter,
  referenceYear: string,
  now: Date,
): Prisma.UserWhereInput {
  const pendingInYear = { schoolYear: referenceYear, ...pendingEnrollmentWhere(now) }
  if (filter === 'PENDING') {
    return { enrollments: { some: pendingInYear } }
  }

  const dueInYear = { schoolYear: referenceYear, ...dueEnrollmentWhere(now) }
  const owesNothingInYear = { NOT: { enrollments: { some: pendingInYear } } }

  if (filter === 'PAID') {
    // No separate "enrolled in referenceYear" clause: `dueInYear` carries the
    // year itself, so a match already proves the enrollment exists.
    return { AND: [owesNothingInYear, { enrollments: { some: dueInYear } }] }
  }
  return {
    AND: [
      owesNothingInYear,
      { enrollments: { some: { schoolYear: referenceYear } } },
      { NOT: { enrollments: { some: dueInYear } } },
    ],
  }
}
