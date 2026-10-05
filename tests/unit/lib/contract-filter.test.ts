import { describe, expect, it } from 'vitest'
import { contractState, contractEnrollmentWhere } from '@/lib/contract-filter'

describe('contractState', () => {
  const d = new Date('2026-09-15')

  it('is null when there is no enrollment to ask about', () => {
    expect(contractState([])).toBeNull()
  })

  it('is SIGNED only when every enrollment is signed', () => {
    expect(contractState([d, d])).toBe('SIGNED')
  })

  it('is NOT_SIGNED when none is', () => {
    expect(contractState([null, null])).toBe('NOT_SIGNED')
  })

  it('is PARTIAL for a child who signed for one group and not the other', () => {
    expect(contractState([d, null])).toBe('PARTIAL')
  })
})

describe('contractEnrollmentWhere', () => {
  it('maps each filter onto contractSignedAt', () => {
    expect(contractEnrollmentWhere('SIGNED')).toEqual({ contractSignedAt: { not: null } })
    expect(contractEnrollmentWhere('NOT_SIGNED')).toEqual({ contractSignedAt: null })
  })
})
