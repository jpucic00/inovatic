import { describe, it, expect } from 'vitest'
import { groupRosterStatus, type GroupRosterStatusSource } from '@/lib/group-roster-status'

const NOW = new Date('2026-10-10T10:00:00.000Z')
const STARTED = new Date('2026-09-28T00:00:00.000Z')
const LATER = new Date('2027-01-11T00:00:00.000Z')

function standard(overrides: Partial<GroupRosterStatusSource> = {}): GroupRosterStatusSource {
  return {
    schoolYear: '2026/2027',
    fullYearPaidAt: null,
    scheduledGroup: { course: { kind: 'STANDARD' } },
    moduleEnrollments: [{ paidAt: null, moduleSchedule: { startDate: STARTED } }],
    enrollmentMonths: [],
    consentGallery: null,
    consentWebsite: null,
    consentSocial: null,
    consentEmail: null,
    contractSignedAt: null,
    ...overrides,
  }
}

describe('groupRosterStatus', () => {
  it('an unpaid started module reads Nije plaćeno, with no contract', () => {
    const status = groupRosterStatus(standard(), NOW)
    expect(status.paymentStatus).toBe('PENDING')
    expect(status.contractSignedAt).toBeNull()
  })

  it('a module not yet due reads Nije dospjelo, as on /admin/ucenici', () => {
    const status = groupRosterStatus(
      standard({ moduleEnrollments: [{ paidAt: null, moduleSchedule: { startDate: LATER } }] }),
      NOW,
    )
    expect(status.paymentStatus).toBe('NOT_DUE')
  })

  it('a paid started module reads Plaćeno and keeps the contract date', () => {
    const status = groupRosterStatus(
      standard({
        contractSignedAt: STARTED,
        moduleEnrollments: [{ paidAt: STARTED, moduleSchedule: { startDate: STARTED } }],
      }),
      NOW,
    )
    expect(status.paymentStatus).toBe('PAID')
    expect(status.contractSignedAt).toEqual(STARTED)
  })

  it('competition months decide a competition enrollment', () => {
    const status = groupRosterStatus(
      standard({
        scheduledGroup: { course: { kind: 'COMPETITION' } },
        moduleEnrollments: [],
        enrollmentMonths: [{ paidAt: null, periodStart: new Date('2026-10-01T00:00:00.000Z') }],
      }),
      NOW,
    )
    expect(status.paymentStatus).toBe('PENDING')
  })

  it('carries only the four consents', () => {
    const status = groupRosterStatus(standard({ consentWebsite: false }), NOW)
    expect(status.consents).toEqual({
      consentGallery: null,
      consentWebsite: false,
      consentSocial: null,
      consentEmail: null,
    })
  })
})
