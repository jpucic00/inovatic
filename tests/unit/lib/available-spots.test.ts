import { describe, expect, it } from 'vitest'
import { computeAvailableSpots } from '@/lib/available-spots'

describe('computeAvailableSpots', () => {
  it('returns capacity when nothing is enrolled', () => {
    expect(computeAvailableSpots(10, 0)).toBe(10)
  })

  it('returns one when capacity − active = 1 (one open spot)', () => {
    expect(computeAvailableSpots(10, 9)).toBe(1)
  })

  it('returns 0 when fully booked (capacity equals active)', () => {
    expect(computeAvailableSpots(10, 10)).toBe(0)
  })

  it('returns 0 (not negative) when overflow', () => {
    expect(computeAvailableSpots(10, 15)).toBe(0)
    expect(computeAvailableSpots(10, 11)).toBe(0)
  })

  it('handles capacity 0 (admin disabled enrollment)', () => {
    expect(computeAvailableSpots(0, 0)).toBe(0)
    expect(computeAvailableSpots(0, 5)).toBe(0)
  })

  it('handles capacity 1 and active 0', () => {
    expect(computeAvailableSpots(1, 0)).toBe(1)
  })

  it('handles large capacity numbers', () => {
    expect(computeAvailableSpots(1000, 250)).toBe(750)
  })
})
