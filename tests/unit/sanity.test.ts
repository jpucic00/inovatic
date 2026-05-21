import { describe, expect, it } from 'vitest'

describe('vitest sanity', () => {
  it('runs assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves the @/ alias', async () => {
    const mod = await import('@/lib/format')
    expect(typeof mod.formatDate).toBe('function')
  })
})
