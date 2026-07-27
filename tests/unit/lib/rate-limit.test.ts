import { beforeEach, describe, expect, it } from 'vitest'
import { allowRequest, resetRateLimits } from '@/lib/rate-limit'

const WINDOW = 60_000
const T0 = 1_800_000_000_000

describe('allowRequest', () => {
  beforeEach(() => resetRateLimits())

  it('allows up to the limit and then refuses', () => {
    expect(allowRequest('k', 3, WINDOW, T0)).toBe(true)
    expect(allowRequest('k', 3, WINDOW, T0)).toBe(true)
    expect(allowRequest('k', 3, WINDOW, T0)).toBe(true)
    expect(allowRequest('k', 3, WINDOW, T0)).toBe(false)
  })

  it('keeps buckets independent', () => {
    expect(allowRequest('a', 1, WINDOW, T0)).toBe(true)
    expect(allowRequest('a', 1, WINDOW, T0)).toBe(false)
    expect(allowRequest('b', 1, WINDOW, T0)).toBe(true)
  })

  it('lets the window slide — an old hit stops counting', () => {
    expect(allowRequest('k', 1, WINDOW, T0)).toBe(true)
    expect(allowRequest('k', 1, WINDOW, T0 + WINDOW - 1)).toBe(false)
    expect(allowRequest('k', 1, WINDOW, T0 + WINDOW + 1)).toBe(true)
  })

  // A rejected call must not count, otherwise hammering the endpoint would keep
  // extending the caller's own lockout indefinitely.
  it('does not let refused calls extend the lockout', () => {
    expect(allowRequest('k', 1, WINDOW, T0)).toBe(true)
    for (let i = 1; i <= 20; i++) {
      expect(allowRequest('k', 1, WINDOW, T0 + i)).toBe(false)
    }
    // The single recorded hit is still the only one, so the window clears on time.
    expect(allowRequest('k', 1, WINDOW, T0 + WINDOW + 1)).toBe(true)
  })

  it('is cleared by resetRateLimits', () => {
    expect(allowRequest('k', 1, WINDOW, T0)).toBe(true)
    resetRateLimits()
    expect(allowRequest('k', 1, WINDOW, T0)).toBe(true)
  })
})
