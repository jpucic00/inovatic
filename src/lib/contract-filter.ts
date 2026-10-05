import type { Prisma } from '@prisma/client'

/**
 * "Ugovor potpisan" filter vocabulary, shared by `/admin/ucenici` and the
 * `/admin/email` cohort. Plain, client-safe module (only a type import from
 * Prisma), same shape as the privole filter in `enrollment-consent.ts`.
 */
export const CONTRACT_FILTER_VALUES = ['SIGNED', 'NOT_SIGNED'] as const
export type ContractFilter = (typeof CONTRACT_FILTER_VALUES)[number]

export const CONTRACT_FILTER_LABELS: Record<ContractFilter, string> = {
  SIGNED: 'Ugovor potpisan',
  NOT_SIGNED: 'Ugovor nije potpisan',
}

export function parseContractFilter(raw: string | undefined): ContractFilter | undefined {
  return CONTRACT_FILTER_VALUES.includes(raw as ContractFilter)
    ? (raw as ContractFilter)
    : undefined
}

/**
 * The condition ONE enrollment must meet. Like `consentEnrollmentWhere`, the
 * caller puts it inside the same `enrollments.some` as the year and the
 * group/program filters, so "nije potpisan u grupi X" asks about X.
 */
export function contractEnrollmentWhere(filter: ContractFilter): Prisma.EnrollmentWhereInput {
  return filter === 'SIGNED' ? { contractSignedAt: { not: null } } : { contractSignedAt: null }
}

/**
 * A child's contract across the enrollments a view is about: every one signed,
 * none, or some (a child in two groups who signed for one). Null when there is
 * no enrollment to ask about.
 */
export type ContractState = 'SIGNED' | 'PARTIAL' | 'NOT_SIGNED'

export function contractState(signedAts: readonly (Date | null)[]): ContractState | null {
  if (signedAts.length === 0) return null
  const signed = signedAts.filter((d) => d !== null).length
  if (signed === signedAts.length) return 'SIGNED'
  return signed === 0 ? 'NOT_SIGNED' : 'PARTIAL'
}

export const CONTRACT_STATE_LABELS: Record<ContractState, string> = {
  SIGNED: 'Ugovor potpisan',
  PARTIAL: 'Ugovor djelomično potpisan',
  NOT_SIGNED: 'Ugovor nije potpisan',
}

// Red like "Nije plaćeno": an unsigned contract is the family to chase.
export const CONTRACT_STATE_COLORS: Record<ContractState, string> = {
  SIGNED: 'bg-green-100 text-green-800 border-green-200',
  PARTIAL: 'bg-amber-100 text-amber-800 border-amber-200',
  NOT_SIGNED: 'bg-red-100 text-red-800 border-red-200',
}
