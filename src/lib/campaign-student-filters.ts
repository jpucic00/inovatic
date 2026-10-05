import type { Prisma } from '@prisma/client'
import {
  PAYMENT_STATUS_LABELS,
  paymentStatusUserWhere,
  type PaymentFilter,
} from '@/lib/payment-status'
import {
  CONSENT_FILTER_LABELS,
  consentEnrollmentWhere,
  type ConsentFilter,
} from '@/lib/enrollment-consent'
import {
  CONTRACT_FILTER_LABELS,
  contractEnrollmentWhere,
  type ContractFilter,
} from '@/lib/contract-filter'

/**
 * The `/admin/ucenici` filters, applied to an e-mail campaign's cohort. Absent =
 * "Svi" — the default narrows nothing. Plain, client-safe module: the wizard
 * reads the labels, the action builds the where.
 */
type CampaignStudentFilters = {
  payment?: PaymentFilter
  contract?: ContractFilter
  consent?: ConsentFilter
}

/**
 * User-level narrowing for a cohort of `sourceSchoolYear`, with the same
 * semantics as the student list:
 *  - Plaćanje is the child's status in that year (`paymentStatusUserWhere`),
 *    so the campaign and the Plaćanje column can never disagree about a child.
 *  - Ugovor and privole are per ENROLLMENT, and ask about the enrollment the
 *    selection picked — in group mode one in the selected groups, otherwise any
 *    enrollment of the year. They share one `enrollments.some`, so "nije
 *    potpisan + bez privole za web" means the same enrollment, as on Učenici.
 *
 * Returns null when nothing is set, so callers spread nothing.
 */
export function campaignStudentWhere(
  filters: CampaignStudentFilters,
  sourceSchoolYear: string,
  groupIds: string[] | null,
  now: Date,
): Prisma.UserWhereInput | null {
  const clauses: Prisma.UserWhereInput[] = []
  if (filters.payment) {
    clauses.push(paymentStatusUserWhere(filters.payment, sourceSchoolYear, now))
  }
  if (filters.contract || filters.consent) {
    clauses.push({
      enrollments: {
        some: {
          schoolYear: sourceSchoolYear,
          ...(groupIds ? { scheduledGroupId: { in: groupIds } } : {}),
          ...(filters.contract ? contractEnrollmentWhere(filters.contract) : {}),
          ...(filters.consent ? consentEnrollmentWhere(filters.consent) : {}),
        },
      },
    })
  }
  return clauses.length > 0 ? { AND: clauses } : null
}

/** Display labels for the campaign audit and history — what narrowed the audience. */
export function campaignStudentFilterLabels(filters: CampaignStudentFilters): string[] {
  return [
    filters.payment && `Plaćanje: ${PAYMENT_STATUS_LABELS[filters.payment]}`,
    filters.contract && CONTRACT_FILTER_LABELS[filters.contract],
    filters.consent && CONSENT_FILTER_LABELS[filters.consent],
  ].filter((label): label is string => Boolean(label))
}
