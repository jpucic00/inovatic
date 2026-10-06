import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

const { formatIpEvidence, ipEvidenceFrom, ipFromForwardedFor } = await import('@/lib/client-ip')

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

describe('ipEvidenceFrom', () => {
  it('reads the three candidate headers verbatim', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.99, 198.51.100.4',
      'x-real-ip': '198.51.100.4',
      'cf-connecting-ip': '198.51.100.4',
    })
    expect(ipEvidenceFrom(headers)).toEqual({
      forwardedFor: '203.0.113.99, 198.51.100.4',
      realIp: '198.51.100.4',
      cfConnectingIp: '198.51.100.4',
    })
  })

  it('reports a header that was not sent as null', () => {
    expect(ipEvidenceFrom(new Headers())).toEqual({
      forwardedFor: null,
      realIp: null,
      cfConnectingIp: null,
    })
  })
})

describe('formatIpEvidence', () => {
  it('prints each header by name, and - for one that was not sent', () => {
    expect(
      formatIpEvidence({ forwardedFor: '203.0.113.99, 198.51.100.4', realIp: '198.51.100.4', cfConnectingIp: null }),
    ).toBe('x-forwarded-for=203.0.113.99, 198.51.100.4 x-real-ip=198.51.100.4 cf-connecting-ip=-')
  })

  it('prints - for every header when no evidence was passed', () => {
    expect(formatIpEvidence(undefined)).toBe('x-forwarded-for=- x-real-ip=- cf-connecting-ip=-')
  })

  it('strips CR/LF so a client cannot forge a second log line', () => {
    const out = formatIpEvidence({
      forwardedFor: '1.2.3.4\r\n[auth] fake line',
      realIp: null,
      cfConnectingIp: null,
    })
    expect(out).not.toMatch(/[\r\n]/)
    expect(out).toContain('x-forwarded-for=1.2.3.4[auth] fake line')
  })

  it('caps each value at 200 characters', () => {
    const out = formatIpEvidence({ forwardedFor: 'a'.repeat(500), realIp: null, cfConnectingIp: null })
    expect(out).toBe(`x-forwarded-for=${'a'.repeat(200)} x-real-ip=- cf-connecting-ip=-`)
  })
})
