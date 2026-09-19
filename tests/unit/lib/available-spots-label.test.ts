import { describe, expect, it } from 'vitest'
import { availableSpotsTone, formatAvailableSpots } from '@/lib/available-spots'

describe('formatAvailableSpots', () => {
  it('declines the noun by the last digit, the way Croatian counts', () => {
    expect(formatAvailableSpots(1)).toBe('Još 1 slobodno mjesto')
    expect(formatAvailableSpots(2)).toBe('Još 2 slobodna mjesta')
    expect(formatAvailableSpots(3)).toBe('3 slobodna mjesta')
    expect(formatAvailableSpots(4)).toBe('4 slobodna mjesta')
    expect(formatAvailableSpots(5)).toBe('5 slobodnih mjesta')
    expect(formatAvailableSpots(11)).toBe('11 slobodnih mjesta')
    expect(formatAvailableSpots(12)).toBe('12 slobodnih mjesta')
    expect(formatAvailableSpots(21)).toBe('21 slobodno mjesto')
    expect(formatAvailableSpots(22)).toBe('22 slobodna mjesta')
  })

  it('reads "Popunjeno" at zero and never goes negative', () => {
    expect(formatAvailableSpots(0)).toBe('Popunjeno')
    expect(formatAvailableSpots(-1)).toBe('Popunjeno')
  })

  it('tones: full at zero, low up to two, open above', () => {
    expect(availableSpotsTone(0)).toBe('full')
    expect(availableSpotsTone(1)).toBe('low')
    expect(availableSpotsTone(2)).toBe('low')
    expect(availableSpotsTone(3)).toBe('open')
  })
})
