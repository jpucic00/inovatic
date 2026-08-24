import { describe, it, expect } from 'vitest'
import {
  isEnrollmentPending,
  hasDueItems,
  computeStudentPaymentStatus,
  pendingEnrollmentWhere,
  dueEnrollmentWhere,
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
    scheduledGroup: { course: { kind: 'STANDARD' } },
    moduleEnrollments: modules.map((m) => ({
      paidAt: m.paidAt,
      moduleSchedule: { startDate: m.startDate },
    })),
    enrollmentMonths: [],
  }
}

function radionica(
  opts: { schoolYear?: string; fullYearPaidAt?: Date | null } = {},
): PaymentStatusEnrollment {
  return {
    schoolYear: opts.schoolYear ?? CURRENT_YEAR,
    fullYearPaidAt: opts.fullYearPaidAt ?? null,
    scheduledGroup: { course: { kind: 'RADIONICA' } },
    moduleEnrollments: [],
    enrollmentMonths: [],
  }
}

function competition(
  months: { paidAt: Date | null; periodStart: Date }[],
  opts: { schoolYear?: string } = {},
): PaymentStatusEnrollment {
  return {
    schoolYear: opts.schoolYear ?? CURRENT_YEAR,
    fullYearPaidAt: null,
    scheduledGroup: { course: { kind: 'COMPETITION' } },
    moduleEnrollments: [],
    enrollmentMonths: months,
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

describe('hasDueItems', () => {
  it('is due once a module has started, paid or not', () => {
    expect(hasDueItems(standardEnrollment([{ paidAt: null, startDate: STARTED }]), NOW)).toBe(true)
    expect(
      hasDueItems(standardEnrollment([{ paidAt: new Date(), startDate: STARTED }]), NOW),
    ).toBe(true)
  })

  it('is NOT due while the only module still lies in the future', () => {
    expect(hasDueItems(standardEnrollment([{ paidAt: null, startDate: FUTURE }]), NOW)).toBe(false)
  })

  it('is due when a module carries no start date at all', () => {
    expect(hasDueItems(standardEnrollment([{ paidAt: null, startDate: null }]), NOW)).toBe(true)
  })

  it('is NOT due for an enrollment with zero modules', () => {
    expect(hasDueItems(standardEnrollment([]), NOW)).toBe(false)
  })

  it('counts a whole-year mark on its own, ahead of any module', () => {
    // Paying up front is a payment whatever the calendar says — without this
    // the family that settled early would read as though nothing had happened.
    expect(
      hasDueItems(
        standardEnrollment([{ paidAt: null, startDate: FUTURE }], {
          fullYearPaidAt: new Date(),
        }),
        NOW,
      ),
    ).toBe(true)
  })

  it('radionica is due from the moment of enrollment', () => {
    expect(hasDueItems(radionica(), NOW)).toBe(true)
  })

  it('competition: due once a month has begun, not before', () => {
    expect(hasDueItems(competition([{ paidAt: null, periodStart: STARTED }]), NOW)).toBe(true)
    expect(hasDueItems(competition([{ paidAt: null, periodStart: FUTURE }]), NOW)).toBe(false)
  })
})

describe('computeStudentPaymentStatus', () => {
  it('NONE when there are no enrollments at all', () => {
    expect(computeStudentPaymentStatus([], CURRENT_YEAR, NOW)).toBe('NONE')
  })

  it('NOT_DUE when enrolled this year with nothing started yet', () => {
    // The whole point of the third state: nobody has paid, but nobody owes
    // either. Green here would have claimed a payment that never happened.
    expect(
      computeStudentPaymentStatus(
        [standardEnrollment([{ paidAt: null, startDate: FUTURE }])],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('NOT_DUE')
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

  it('NOT_DUE for a dropped/zero-module current-year enrollment', () => {
    expect(computeStudentPaymentStatus([standardEnrollment([])], CURRENT_YEAR, NOW)).toBe(
      'NOT_DUE',
    )
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

  // The reported bug, in one pair of assertions. Through the summer the admin
  // is enrolling into a year the calendar has not reached, and reading "Bez
  // upisa" over children who are demonstrably enrolled.
  it('answers about the year it is ASKED about, not about today', () => {
    const nextYearOnly = [
      standardEnrollment([{ paidAt: null, startDate: FUTURE }], { schoolYear: '2027/2028' }),
    ]
    expect(computeStudentPaymentStatus(nextYearOnly, CURRENT_YEAR, NOW)).toBe('NONE')
    expect(computeStudentPaymentStatus(nextYearOnly, '2027/2028', NOW)).toBe('NOT_DUE')
  })

  // Last year's settled modules say nothing about whether this year has begun,
  // so PAID is decided inside the reference year — unlike PENDING, which is
  // deliberately cross-year because a debt follows a family.
  it('does not let a previous year\'s paid modules read as PAID for this one', () => {
    expect(
      computeStudentPaymentStatus(
        [
          standardEnrollment([{ paidAt: new Date(), startDate: STARTED }], {
            schoolYear: PAST_YEAR,
          }),
          standardEnrollment([{ paidAt: null, startDate: FUTURE }]),
        ],
        CURRENT_YEAR,
        NOW,
      ),
    ).toBe('NOT_DUE')
  })
})

describe('pendingEnrollmentWhere (drift guard)', () => {
  it('builds a year-independent where with one branch per billing model', () => {
    const where = pendingEnrollmentWhere(NOW)
    expect(where.fullYearPaidAt).toBeNull()
    expect(where).not.toHaveProperty('schoolYear')
    expect(Array.isArray(where.OR)).toBe(true)
    // radionica (always owed) + competition (a started, unpaid month) +
    // standard (a started, unpaid module). One arm per arm of
    // `isEnrollmentPending` — the two MUST stay in sync.
    expect(where.OR).toHaveLength(3)
  })
})

describe('dueEnrollmentWhere (drift guard)', () => {
  it('builds a year-independent where with one branch per arm of hasDueItems', () => {
    const where = dueEnrollmentWhere(NOW)
    // The year is the caller's to add — paymentStatusUserWhere spreads this
    // alongside a schoolYear, so baking one in here would silently double up.
    expect(where).not.toHaveProperty('schoolYear')
    expect(Array.isArray(where.OR)).toBe(true)
    // whole-year mark + radionica + competition month + standard module.
    expect(where.OR).toHaveLength(4)
  })

  it('accepts a paid enrollment, unlike its pending twin', () => {
    // The two mirrors differ by exactly this: pending excludes a settled row,
    // due includes it. If they ever agreed, PAID and NOT_DUE would collapse.
    expect(pendingEnrollmentWhere(NOW).fullYearPaidAt).toBeNull()
    expect(dueEnrollmentWhere(NOW).OR?.[0]).toEqual({ fullYearPaidAt: { not: null } })
  })
})
