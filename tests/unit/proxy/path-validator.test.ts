import { describe, expect, it } from 'vitest'
import { validateProxyPath } from '@/app/api/proxy/elearning/_helpers'

describe('validateProxyPath', () => {
  it('accepts a normal valid path', () => {
    expect(validateProxyPath(['course', 'lesson', '1'])).toEqual({ ok: true })
  })

  it('accepts deep but ≤ 20-segment paths', () => {
    const deep = Array.from({ length: 20 }, (_, i) => `s${i}`)
    expect(validateProxyPath(deep)).toEqual({ ok: true })
  })

  it('rejects depth > 20 with reason "depth"', () => {
    const tooDeep = Array.from({ length: 21 }, (_, i) => `s${i}`)
    const result = validateProxyPath(tooDeep)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.reason).toBe('depth')
    }
  })

  it('rejects backslash in segment with reason "segment"', () => {
    const result = validateProxyPath(['foo', 'bar\\baz'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.reason).toBe('segment')
    }
  })

  it('rejects literal traversal segment "..": post-decoded form of %2E%2E', () => {
    // Next.js URL routing decodes %2E%2E → .. before this validator sees it.
    // Testing the decoded form per "defence at the boundary, not in middleware".
    expect(validateProxyPath(['foo', '..']).ok).toBe(false)
    expect(validateProxyPath(['..', 'foo']).ok).toBe(false)
  })

  it('rejects "." segment', () => {
    expect(validateProxyPath(['.']).ok).toBe(false)
    expect(validateProxyPath(['foo', '.']).ok).toBe(false)
  })

  it('rejects segment containing ".." substring', () => {
    expect(validateProxyPath(['foo..bar']).ok).toBe(false)
    expect(validateProxyPath(['..foo']).ok).toBe(false)
  })

  it('rejects empty segment', () => {
    expect(validateProxyPath(['']).ok).toBe(false)
    expect(validateProxyPath(['foo', '']).ok).toBe(false)
  })

  it('rejects segment containing NUL byte', () => {
    expect(validateProxyPath([`foo${String.fromCodePoint(0)}bar`]).ok).toBe(false)
  })

  it('accepts empty path array (handler decides what to do)', () => {
    expect(validateProxyPath([])).toEqual({ ok: true })
  })

  it('accepts segments with dots not adjacent to each other (file extensions)', () => {
    expect(validateProxyPath(['lesson.html'])).toEqual({ ok: true })
    expect(validateProxyPath(['video.mp4'])).toEqual({ ok: true })
  })

  it('accepts segments with forward slashes replaced by the routing layer (single segment is fine)', () => {
    expect(validateProxyPath(['foo-bar_baz.html'])).toEqual({ ok: true })
  })
})
