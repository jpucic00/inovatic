import type { Prisma } from '@prisma/client'

export type PaymentStatus = 'PAID' | 'PENDING' | 'NONE'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: 'Plaćeno',
  PENDING: 'Nije plaćeno',
  NONE: 'Bez upisa',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PAID: 'bg-green-100 text-green-800 border-green-200',
  PENDING: 'bg-red-100 text-red-800 border-red-200',
  NONE: 'bg-gray-100 text-gray-500 border-gray-200',
}

// Ascending sort puts debtors (PENDING) first.
export const PAYMENT_STATUS_SORT_KEY: Record<PaymentStatus, number> = {
  PENDING: 0,
  PAID: 1,
  NONE: 2,
}

export const PAYMENT_FILTER_VALUES = ['PENDING', 'PAID'] as const
export type PaymentFilter = (typeof PAYMENT_FILTER_VALUES)[number]

export type PaymentStatusEnrollment = {
  schoolYear: string
  fullYearPaidAt: Date | null
  scheduledGroup: { course: { isCustom: boolean } }
  moduleEnrollments: {
    paidAt: Date | null
    moduleSchedule: { startDate: Date | null }
  }[]
}

/**
 * Year-independent: a debt counts regardless of which school year the
 * enrollment belongs to. An enrollment is "pending" (still owes money) when it
 * is not marked whole-year-paid AND either it is a radionica (the enrollment
 * itself is the single payable item) or it has at least one started, unpaid
 * module. A module is "started" once its window has begun (startDate <= now);
 * a NULL startDate is treated as started/owed.
 *
 * MUST stay in sync with `pendingEnrollmentWhere` below.
 */
export function isEnrollmentPending(
  enrollment: PaymentStatusEnrollment,
  now: Date,
): boolean {
  if (enrollment.fullYearPaidAt) return false
  if (enrollment.scheduledGroup.course.isCustom) return true
  return enrollment.moduleEnrollments.some(
    (me) =>
      me.paidAt === null &&
      (me.moduleSchedule.startDate === null || me.moduleSchedule.startDate <= now),
  )
}

/**
 * Resolution order:
 *   1. owes anything in ANY year  -> PENDING (debt persists across years)
 *   2. else enrolled in currentYear -> PAID
 *   3. else                         -> NONE
 */
export function computeStudentPaymentStatus(
  enrollments: PaymentStatusEnrollment[],
  currentYear: string,
  now: Date,
): PaymentStatus {
  if (enrollments.some((e) => isEnrollmentPending(e, now))) return 'PENDING'
  if (enrollments.some((e) => e.schoolYear === currentYear)) return 'PAID'
  return 'NONE'
}

/**
 * Prisma mirror of `isEnrollmentPending` (year-independent). MUST stay in sync.
 */
export function pendingEnrollmentWhere(now: Date): Prisma.EnrollmentWhereInput {
  return {
    fullYearPaidAt: null,
    OR: [
      { scheduledGroup: { course: { isCustom: true } } },
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
 * User-level where for the students list payment filter.
 *   PENDING -> has any pending enrollment (any year)
 *   PAID    -> enrolled in currentYear AND owes nothing in any year
 */
export function paymentStatusUserWhere(
  filter: PaymentFilter,
  currentYear: string,
  now: Date,
): Prisma.UserWhereInput {
  const pending = pendingEnrollmentWhere(now)
  if (filter === 'PENDING') {
    return { enrollments: { some: pending } }
  }
  return {
    AND: [
      { enrollments: { some: { schoolYear: currentYear } } },
      { NOT: { enrollments: { some: pending } } },
    ],
  }
}
