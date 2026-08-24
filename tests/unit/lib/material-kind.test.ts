import { describe, expect, it } from 'vitest'
import { displayKindOf, kindOf } from '@/lib/material-display'

describe('kindOf — classifies a material into a display bucket', () => {
  it('treats a first-class ROBOCAMP row as robocamp', () => {
    expect(kindOf({ type: 'ROBOCAMP', externalUrl: 'https://elearning.robocamp.eu/x' })).toBe('robocamp')
  })

  it('falls back to the URL for un-backfilled rows still typed VIDEO', () => {
    expect(kindOf({ type: 'VIDEO', externalUrl: 'https://elearning.robocamp.eu/course/1' })).toBe('robocamp')
  })

  it('keeps a real video out of the robocamp bucket', () => {
    expect(kindOf({ type: 'VIDEO', externalUrl: 'https://www.youtube.com/watch?v=x' })).toBe('videos')
  })

  it('buckets an uploaded video file as a video', () => {
    expect(kindOf({ type: 'VIDEO', externalUrl: null })).toBe('videos')
  })

  it('buckets documents and presentations together', () => {
    expect(kindOf({ type: 'DOCUMENT', externalUrl: null })).toBe('docs')
    expect(kindOf({ type: 'PRESENTATION', externalUrl: null })).toBe('docs')
  })

  it('buckets a plain link as a link', () => {
    expect(kindOf({ type: 'LINK', externalUrl: 'https://example.com' })).toBe('links')
  })
})

describe('displayKindOf — the label a child reads', () => {
  it('splits presentations back out of the document bucket', () => {
    expect(kindOf({ type: 'PRESENTATION', externalUrl: null })).toBe('docs')
    expect(displayKindOf({ type: 'PRESENTATION', externalUrl: null })).toBe('presentation')
    expect(displayKindOf({ type: 'DOCUMENT', externalUrl: null })).toBe('document')
  })

  it('inherits the robocamp rule rather than restating it', () => {
    expect(displayKindOf({ type: 'VIDEO', externalUrl: 'https://elearning.robocamp.eu/c/1' })).toBe('robocamp')
    expect(displayKindOf({ type: 'ROBOCAMP', externalUrl: null })).toBe('robocamp')
  })

  it('labels the remaining kinds one-to-one', () => {
    expect(displayKindOf({ type: 'VIDEO', externalUrl: 'https://youtu.be/x' })).toBe('video')
    expect(displayKindOf({ type: 'LINK', externalUrl: 'https://example.com' })).toBe('link')
  })
})
