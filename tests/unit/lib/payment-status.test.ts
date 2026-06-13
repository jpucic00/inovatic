import { describe, it, expect } from 'vitest'
import {
  isEnrollmentPending,
  computeStudentPaymentStatus,
  pendingEnrollmentWhere,
  type PaymentStatusEnrollment,
} from '@/lib/payment-status'

const NOW = new Date('2026-11-15T00:00:00.000Z')
const CURRENT_YEAR = '2026/2027'
const PAST_YEAR = '2025/2026'

const STARTED = new Date('2026-10-01T00:00:00.000Z') // before NOW
const FUTURE = new Date('2026-12-20T00:00:00.000Z') // after NOW
const TODAY = NOW

function standardEnrollment(
  modules: { paidAt: Date | null; startDate: Date | null }[],
  opts: { schoolYear?: string; fullYearPaidAt?: Date | null } = {},
): PaymentStatusEnrollment {
  return {
    schoolYear: opts.schoolYear ?? CURRENT_YEAR,
    fullYearPaidAt: opts.fullYearPaidAt ?? null,
    scheduledGroup: { course: { isCustom: false } },
    moduleEnrollments: modules.map((m) => ({
      paidAt: m.paidAt,
      moduleSchedule: { startDate: m.startDate },
    })),
  }
}

function radionica(
  opts: { schoolYear?: string; fullYearPaidAt?: Date | null } = {},
): PaymentStatusEnrollment {
  return {
    schoolYear: opts.schoolYear ?? CURRENT_YEAR,
    fullYearPaidAt: opts.fullYearPaidAt ?? null,
    scheduledGroup: { course: { isCustom: true } },
    moduleEnrollments: [],
  }
}

describe('isEnrollmentPending', () => {
  it('is pending when a started module is unpaid', () => {
    expect(isEnrollmentPending(standardEnrollment([{ paidAt: null, startDate: STARTED }]), NOW)).toBe(true)
  })

  it('is pending when a module has NULL startDate and is unpaid', () => {
    expect(isEnrollmentPending(standardEnrollment([{ paidAt: null, startDate: null }]), NOW)).toBe(true)
  })

  it('is pending when startDate is exactly today', () => {
    expect(isEnrollmentPending(standardEnrollment([{ paidAt: null, startDate: TODAY }]), NOW)).toBe(true)
  })

  it('is NOT pending when the only unpaid module starts in the future', () => {
    expect(isEnrollmentPending(standardEnrollment([{ paidAt: null, startDate: FUTURE }]), NOW)).toBe(false)
  })

  it('is NOT pending when all started modules are paid', () => {
    expect(
      isEnrollmentPending(
        standardEnrollment([{ paidAt: new Date(), startDate: STARTED }]),
        NOW,
      ),
    ).toBe(false)
  })

  it('is NOT pending when fullYearPaidAt overrides unpaid started modules', () => {
    expect(
      isEnrollmentPending(
        standardEnrollment([{ paidAt: null, startDate: STARTED }], { fullYearPaidAt: new Date() }),
        NOW,
      ),
    ).toBe(false)
  })

  it('is NOT pending for an enrollment with zero modules (all dropped)', () => {
    expect(isEnrollmentPending(standardEnrollment([]), NOW)).toBe(false)
  })

  it('radionica: pending when not year-paid', () => {
    expect(isEnrollmentPending(radionica(), NOW)).toBe(true)
  })

  it('radionica: NOT pending when year-paid', () => {
    expect(isEnrollmentPending(radionica({ fullYearPaidAt: new Date() }), NOW)).toBe(false)
  })
})

describe('computeStudentPaymentStatus', () => {
  it('NONE when there are no enrollments at all', () => {
    expect(computeStudentPaymentStatus([], CURRENT_YEAR, NOW)).toBe('NONE')
  })

  it('PAID when enrolled this year with nothing started yet', () => {
    expect(
      computeStudentPaymentStatus(
        [standardEnrollment([{ paidAt: null, startDate: FUTURE }])],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('PAID')
  })

  it('PAID when all current-year started modules are paid', () => {
    expect(
      computeStudentPaymentStatus(
        [standardEnrollment([{ paidAt: new Date(), startDate: STARTED }])],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('PAID')
  })

  it('PAID for a dropped/zero-module current-year enrollment', () => {
    expect(computeStudentPaymentStatus([standardEnrollment([])], CURRENT_YEAR, NOW)).toBe('PAID')
  })

  it('PAID when year-paid covers a later-added unpaid started module', () => {
    expect(
      computeStudentPaymentStatus(
        [
          standardEnrollment([{ paidAt: null, startDate: STARTED }], {
            fullYearPaidAt: new Date(),
          }),
        ],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('PAID')
  })

  it('PENDING when a current-year started module is unpaid', () => {
    expect(
      computeStudentPaymentStatus(
        [standardEnrollment([{ paidAt: null, startDate: STARTED }])],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('PENDING')
  })

  it('PENDING for an unpaid radionica', () => {
    expect(computeStudentPaymentStatus([radionica()], CURRENT_YEAR, NOW)).toBe('PENDING')
  })

  it('PENDING when at least one of several enrollments owes', () => {
    expect(
      computeStudentPaymentStatus(
        [
          standardEnrollment([{ paidAt: new Date(), startDate: STARTED }]),
          standardEnrollment([{ paidAt: null, startDate: STARTED }]),
        ],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('PENDING')
  })

  // Cross-year debt persistence.
  it('PENDING for a past-year unpaid started module even with no current-year enrollment', () => {
    expect(
      computeStudentPaymentStatus(
        [standardEnrollment([{ paidAt: null, startDate: STARTED }], { schoolYear: PAST_YEAR })],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('PENDING')
  })

  it('NONE for a past-year fully-paid student with no current enrollment', () => {
    expect(
      computeStudentPaymentStatus(
        [standardEnrollment([{ paidAt: new Date(), startDate: STARTED }], { schoolYear: PAST_YEAR })],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('NONE')
  })
})

describe('pendingEnrollmentWhere (drift guard)', () => {
  it('builds a year-independent where with radionica + started-module branches', () => {
    const where = pendingEnrollmentWhere(NOW)
    expect(where.fullYearPaidAt).toBeNull()
    expect(where).not.toHaveProperty('schoolYear')
    expect(Array.isArray(where.OR)).toBe(true)
    expect(where.OR).toHaveLength(2)
  })
})
