import { describe, expect, it } from 'vitest'
import { getEnrollmentWindowState, isEnrollmentOpen } from '@/lib/enrollment-window'

const now = new Date('2026-07-01T12:00:00Z')

describe('getEnrollmentWindowState', () => {
  it('is "unset" when either date is missing', () => {
    expect(getEnrollmentWindowState(null, null, now)).toBe('unset')
    expect(getEnrollmentWindowState(new Date('2026-06-01'), null, now)).toBe('unset')
    expect(getEnrollmentWindowState(null, new Date('2026-08-01'), now)).toBe('unset')
  })

  it('is "upcoming" before the start date', () => {
    expect(
      getEnrollmentWindowState(new Date('2026-08-01'), new Date('2026-09-01'), now),
    ).toBe('upcoming')
  })

  it('is "open" when now is inside the range', () => {
    expect(
      getEnrollmentWindowState(new Date('2026-06-01'), new Date('2026-08-01'), now),
    ).toBe('open')
  })

  it('is "closed" after the end date', () => {
    expect(
      getEnrollmentWindowState(new Date('2026-05-01'), new Date('2026-06-01'), now),
    ).toBe('closed')
  })
})

describe('isEnrollmentOpen', () => {
  it('only true for an open window', () => {
    expect(isEnrollmentOpen(new Date('2026-06-01'), new Date('2026-08-01'), now)).toBe(true)
    expect(isEnrollmentOpen(null, null, now)).toBe(false)
    expect(isEnrollmentOpen(new Date('2026-08-01'), new Date('2026-09-01'), now)).toBe(false)
  })
})
