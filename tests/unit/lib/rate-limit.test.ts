import { beforeEach, describe, expect, it } from 'vitest'
import { allowRequest, isRateLimited, recordHit, resetRateLimits } from '@/lib/rate-limit'

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

// The map holds every limiter at once and is capped at 5000 keys; past that
// it prunes and, if still full, evicts.
describe('overflow', () => {
  const MAX_KEYS = 5_000
  const MIN = 60_000
  const LOGIN_WINDOW = 15 * MIN
  const HOUR = 60 * MIN

  beforeEach(() => resetRateLimits())

  it('prunes each bucket by its own window, not the caller\'s', () => {
    expect(allowRequest('stem:ip:a', 1, HOUR, T0)).toBe(true)
    for (let i = 1; i < MAX_KEYS; i++) recordHit(`junk:${i}`, LOGIN_WINDOW, T0)

    // 20 min later a 15-min caller overflows the map: the junk has expired, the
    // 1-h STEM hit has not and must still count.
    recordHit('junk:trigger', LOGIN_WINDOW, T0 + 20 * MIN)
    expect(allowRequest('stem:ip:a', 1, HOUR, T0 + 20 * MIN)).toBe(false)
  })

  it('evicts the buckets with the fewest hits first, so a lock survives a flood', () => {
    for (let i = 0; i < 5; i++) recordHit('login:id:locked', LOGIN_WINDOW, T0)
    for (let i = 0; i < MAX_KEYS + 1_000; i++) recordHit(`junk:${i}`, LOGIN_WINDOW, T0 + 1 + i)

    const now = T0 + MAX_KEYS + 1_000
    expect(isRateLimited('login:id:locked', 5, LOGIN_WINDOW, now)).toBe(true)
    // Among equals, the oldest goes first: the earliest junk is gone, the latest kept.
    expect(isRateLimited('junk:0', 1, LOGIN_WINDOW, now)).toBe(false)
    expect(isRateLimited(`junk:${MAX_KEYS + 999}`, 1, LOGIN_WINDOW, now)).toBe(true)
  })
})
