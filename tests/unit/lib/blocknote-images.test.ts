import { describe, expect, it } from 'vitest'
import { extractImageUrls, mapImageUrls } from '@/lib/blocknote-images'
import { withWatermark } from '@/lib/cloudinary-url'

const CLOUD = 'https://res.cloudinary.com/dgc2tp4f8'
const IMG = `${CLOUD}/image/upload/v1/articles/inline/a.jpg`
const IMG2 = `${CLOUD}/image/upload/v1/articles/inline/b.jpg`
const VIDEO = `${CLOUD}/video/upload/v1/articles/inline/saonice.mp4`

const content = [
  { type: 'paragraph', content: [{ type: 'text', text: 'Uvod' }] },
  { type: 'image', props: { url: IMG, caption: 'Prva' } },
  { type: 'video', props: { url: VIDEO } },
  {
    type: 'paragraph',
    props: {},
    children: [{ type: 'image', props: { url: IMG2 } }],
  },
]

describe('mapImageUrls', () => {
  it('rewrites every image url, including nested children', () => {
    const next = mapImageUrls(content, withWatermark)
    const urls = extractImageUrls(next)
    expect(urls).toContain(withWatermark(IMG))
    expect(urls).toContain(withWatermark(IMG2))
  })

  it('leaves video blocks untouched — the watermark is image-only', () => {
    const next = mapImageUrls(content, withWatermark)
    expect(extractImageUrls(next)).toContain(VIDEO)
  })

  it('does not mutate the input', () => {
    const before = JSON.stringify(content)
    mapImageUrls(content, withWatermark)
    expect(JSON.stringify(content)).toBe(before)
  })

  it('preserves sibling props and unrelated blocks', () => {
    const next = mapImageUrls(content, withWatermark) as typeof content
    expect(next[1].props).toMatchObject({ caption: 'Prva' })
    expect(next[0]).toEqual(content[0])
  })

  it('is a no-op when the mapper returns the url unchanged', () => {
    expect(extractImageUrls(mapImageUrls(content, (u) => u))).toEqual(
      extractImageUrls(content),
    )
  })

  it('survives content shapes that predate the current editor', () => {
    expect(mapImageUrls([], withWatermark)).toEqual([])
    expect(mapImageUrls(null, withWatermark)).toBeNull()
    expect(mapImageUrls({ type: 'image' }, withWatermark)).toEqual({ type: 'image' })
    expect(mapImageUrls({ type: 'image', props: { url: '' } }, withWatermark)).toEqual({
      type: 'image',
      props: { url: '' },
    })
  })
})
