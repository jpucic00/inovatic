import { describe, expect, it } from 'vitest'
import { kindOf } from '@/lib/group-materials-view'

describe('kindOf — classifies a material into a display bucket', () => {
  it('first-class ROBOCAMP type → robocamp', () => {
    expect(kindOf({ type: 'ROBOCAMP', externalUrl: 'https://elearning.robocamp.eu/x' })).toBe('robocamp')
  })

  it('legacy VIDEO with a robocamp externalUrl → robocamp (backfill fallback)', () => {
    expect(kindOf({ type: 'VIDEO', externalUrl: 'https://elearning.robocamp.eu/course/1' })).toBe('robocamp')
  })

  it('VIDEO with a YouTube URL → videos', () => {
    expect(kindOf({ type: 'VIDEO', externalUrl: 'https://www.youtube.com/watch?v=x' })).toBe('videos')
  })

  it('VIDEO with an uploaded file (no externalUrl) → videos', () => {
    expect(kindOf({ type: 'VIDEO', externalUrl: null })).toBe('videos')
  })

  it('DOCUMENT → docs', () => {
    expect(kindOf({ type: 'DOCUMENT', externalUrl: null })).toBe('docs')
  })

  it('PRESENTATION → docs', () => {
    expect(kindOf({ type: 'PRESENTATION', externalUrl: null })).toBe('docs')
  })

  it('LINK → links', () => {
    expect(kindOf({ type: 'LINK', externalUrl: 'https://example.com' })).toBe('links')
  })
})
