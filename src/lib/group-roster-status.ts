import {
  computeStudentPaymentStatus,
  type PaymentStatus,
  type PaymentStatusEnrollment,
} from '@/lib/payment-status'
import { pickConsents, type EnrollmentConsents } from '@/lib/enrollment-consent'

/**
 * What a row on `/admin/grupe/[id]` says about one enrollment: the same
 * Plaćanje state as the `/admin/ucenici` column, whether the contract came
 * back, and the privole — so a child who dropped out can be spotted and taken
 * out of the module without opening the profile.
 *
 * Plain, client-safe module: computed on the server page, rendered by client rows.
 */
export type GroupRosterStatus = {
  paymentStatus: PaymentStatus
  contractSignedAt: Date | null
  consents: EnrollmentConsents
}

export type GroupRosterStatusSource = PaymentStatusEnrollment &
  EnrollmentConsents & { contractSignedAt: Date | null }

/**
 * Payment is asked about THIS enrollment in its own school year — a child in
 * two groups owing in the other one must not turn this group's row red.
 */
export function groupRosterStatus(
  enrollment: GroupRosterStatusSource,
  now: Date,
): GroupRosterStatus {
  return {
    paymentStatus: computeStudentPaymentStatus([enrollment], enrollment.schoolYear, now),
    contractSignedAt: enrollment.contractSignedAt,
    consents: pickConsents(enrollment),
  }
}
