import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

const { ipFromForwardedFor } = await import('@/lib/client-ip')

describe('ipFromForwardedFor', () => {
  it('takes the first hop of a proxied chain', () => {
    expect(ipFromForwardedFor('203.0.113.7, 10.0.0.1')).toBe('203.0.113.7')
  })

  it('trims whitespace around the hop', () => {
    expect(ipFromForwardedFor('  203.0.113.7  ,10.0.0.1')).toBe('203.0.113.7')
  })

  it('folds a missing or blank header into one shared "unknown" bucket', () => {
    expect(ipFromForwardedFor(null)).toBe('unknown')
    expect(ipFromForwardedFor(undefined)).toBe('unknown')
    expect(ipFromForwardedFor(' ')).toBe('unknown')
  })
})
