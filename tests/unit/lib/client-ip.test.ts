import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

const { clientIpFrom } = await import('@/lib/client-ip')

describe('clientIpFrom', () => {
  it('reads x-real-ip, which the edge overwrites', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '95.168.108.201' }))).toBe('95.168.108.201')
  })

  it('trims surrounding whitespace', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '  95.168.108.201  ' }))).toBe('95.168.108.201')
  })

  // The production shape: the edge replaces a forged XFF with "<client>, <edge hop>",
  // and a client-sent value must never be what the limiter counts.
  it('ignores x-forwarded-for entirely', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.99, 152.233.13.166',
      'x-real-ip': '95.168.108.201',
    })
    expect(clientIpFrom(headers)).toBe('95.168.108.201')
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '203.0.113.99' }))).toBe('unknown')
  })

  it('puts a missing or blank header into the shared unknown bucket', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown')
    expect(clientIpFrom(new Headers({ 'x-real-ip': ' ' }))).toBe('unknown')
  })

  describe('a missing header in production', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    async function freshModule() {
      vi.resetModules()
      return import('@/lib/client-ip')
    }

    it('is logged once per process, not on every request', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { clientIpFrom: fresh } = await freshModule()

      expect(fresh(new Headers())).toBe('unknown')
      expect(fresh(new Headers({ 'x-real-ip': ' ' }))).toBe('unknown')
      expect(fresh(new Headers({ 'x-real-ip': '95.168.108.201' }))).toBe('95.168.108.201')

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatch(/x-real-ip/)
    })

    it('is not logged outside production, where there is no edge', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { clientIpFrom: fresh } = await freshModule()

      expect(fresh(new Headers())).toBe('unknown')
      expect(warn).not.toHaveBeenCalled()
    })
  })
})
