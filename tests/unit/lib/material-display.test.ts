import { describe, expect, it } from 'vitest'
import { formatBytes, resolveHref } from '@/lib/material-display'

/**
 * Two helpers now shared by the kids' cards AND the staff rows — one regression
 * breaks every material link or size label on both surfaces at once.
 */
describe('resolveHref', () => {
  it('prefers the external URL over an uploaded file', () => {
    expect(
      resolveHref({ id: 'm1', externalUrl: 'https://example.com/x', fileUrl: 'https://cdn/x.pdf' }),
    ).toBe('https://example.com/x')
  })

  it('routes an uploaded file through the authorised download endpoint', () => {
    // Never the raw fileUrl: /api/download/<id> is where the enrollment check
    // and the city rule for GROUP-scope files live.
    expect(resolveHref({ id: 'm2', externalUrl: null, fileUrl: 'https://cdn/x.pdf' })).toBe(
      '/api/download/m2',
    )
  })

  it('yields null when there is nothing to open', () => {
    expect(resolveHref({ id: 'm3', externalUrl: null, fileUrl: null })).toBeNull()
  })
})

describe('formatBytes', () => {
  it('prints nothing for missing or zero sizes', () => {
    expect(formatBytes(null)).toBeNull()
    expect(formatBytes(undefined)).toBeNull()
    expect(formatBytes(0)).toBeNull()
  })

  it('steps through B, KB and MB at the right boundaries', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})
