import { describe, expect, it } from 'vitest'
import { citySlug, cityFromSlug, CITY_VALUES } from '@/lib/city'

describe('citySlug / cityFromSlug', () => {
  it('round-trips every city', () => {
    for (const c of CITY_VALUES) {
      expect(cityFromSlug(citySlug(c))).toBe(c)
    }
  })

  it('maps to the expected `?grad=` slugs', () => {
    expect(citySlug('SPLIT')).toBe('split')
    expect(citySlug('SIBENIK')).toBe('sibenik')
  })

  it('parses case-insensitively', () => {
    expect(cityFromSlug('Sibenik')).toBe('SIBENIK')
    expect(cityFromSlug('SPLIT')).toBe('SPLIT')
  })

  it('returns null for unknown or non-string input (fail-closed)', () => {
    expect(cityFromSlug('zagreb')).toBeNull()
    expect(cityFromSlug('')).toBeNull()
    expect(cityFromSlug(undefined)).toBeNull()
    expect(cityFromSlug(123)).toBeNull()
  })
})
