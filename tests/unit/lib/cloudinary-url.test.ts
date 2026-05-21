import { describe, expect, it } from 'vitest'
import {
  MIME_TO_EXT,
  cloudinaryThumbUrl,
  publicIdFromUrl,
  resourceTypeFromUrl,
  sanitiseFilename,
} from '@/lib/cloudinary-url'

const CLOUD = 'https://res.cloudinary.com/dgc2tp4f8'

describe('publicIdFromUrl', () => {
  it('extracts publicId with version segment and subdirectories', () => {
    expect(
      publicIdFromUrl(`${CLOUD}/image/upload/v1703001234/articles/covers/my-article.jpg`),
    ).toBe('articles/covers/my-article')
  })

  it('extracts publicId without version segment', () => {
    expect(publicIdFromUrl(`${CLOUD}/image/upload/articles/my.png`)).toBe('articles/my')
  })

  it('extracts publicId when transformations are present (skips version, keeps transform-as-folder)', () => {
    // Current behaviour: only v\d+ segments are dropped; transformations end up
    // in the returned id. Documenting the actual behaviour, not an idealisation.
    const id = publicIdFromUrl(`${CLOUD}/image/upload/c_fill,w_400/v1/articles/x.jpg`)
    expect(id).toBe('c_fill,w_400/articles/x')
  })

  it('extracts publicId from deeply nested subdirectories', () => {
    expect(
      publicIdFromUrl(`${CLOUD}/image/upload/v1/gallery/2026/05/teacher123/abc.webp`),
    ).toBe('gallery/2026/05/teacher123/abc')
  })

  it('strips the file extension from the final segment', () => {
    expect(publicIdFromUrl(`${CLOUD}/image/upload/v1/x.png`)).toBe('x')
    expect(publicIdFromUrl(`${CLOUD}/raw/upload/v1/file.docx`)).toBe('file')
    expect(publicIdFromUrl(`${CLOUD}/image/upload/v1/no-extension`)).toBe('no-extension')
  })

  it('returns null for non-Cloudinary URLs', () => {
    expect(publicIdFromUrl('https://example.com/x.png')).toBeNull()
    expect(publicIdFromUrl('https://imgix.net/x.png')).toBeNull()
  })

  it('returns null for empty / malformed input', () => {
    expect(publicIdFromUrl('')).toBeNull()
    expect(publicIdFromUrl('not-a-url')).toBeNull()
  })

  it('returns null when upload segment is missing', () => {
    expect(publicIdFromUrl(`${CLOUD}/image/v1/x.png`)).toBeNull()
  })

  it('returns null when upload is the final segment (no file)', () => {
    expect(publicIdFromUrl(`${CLOUD}/image/upload`)).toBeNull()
  })

  it('handles a dot inside the filename (only last dot is treated as extension)', () => {
    expect(publicIdFromUrl(`${CLOUD}/image/upload/v1/my.file.name.jpg`)).toBe('my.file.name')
  })
})

describe('sanitiseFilename', () => {
  it('strips Croatian diacritics via NFD (Čćžš → Cczs)', () => {
    expect(sanitiseFilename('Čaobno žito šuška')).toBe('Caobno_zito_suska')
  })

  it('replaces stroke-d (đ, U+0111) — no canonical decomposition — with _', () => {
    expect(sanitiseFilename('đak')).toBe('ak')
    expect(sanitiseFilename('Đak ide')).toBe('ak_ide')
  })

  it('replaces spaces with _', () => {
    expect(sanitiseFilename('hello world')).toBe('hello_world')
  })

  it('collapses runs of underscores from consecutive non-ASCII chars', () => {
    expect(sanitiseFilename('a   b')).toBe('a_b')
    expect(sanitiseFilename('a!!!b')).toBe('a_b')
  })

  it('strips leading and trailing underscores', () => {
    expect(sanitiseFilename('___abc___')).toBe('abc')
    expect(sanitiseFilename(' abc ')).toBe('abc')
  })

  it('preserves allowed chars: alphanumeric, dot, underscore, dash', () => {
    expect(sanitiseFilename('My-File_v2.pdf')).toBe('My-File_v2.pdf')
  })

  it('truncates to 120 chars', () => {
    const result = sanitiseFilename('a'.repeat(200))
    expect(result.length).toBeLessThanOrEqual(120)
  })

  it('falls back to "file" for all-punctuation / all-non-ascii input', () => {
    expect(sanitiseFilename('!!!')).toBe('file')
    expect(sanitiseFilename('___')).toBe('file')
    expect(sanitiseFilename('')).toBe('file')
  })
})

describe('cloudinaryThumbUrl', () => {
  const ORIG = `${CLOUD}/image/upload/v1703001234/articles/x.jpg`

  it('width-only: injects c_limit transformation between /upload/ and version', () => {
    const result = cloudinaryThumbUrl(ORIG, 400)
    expect(result).toBe(
      `${CLOUD}/image/upload/c_limit,f_auto,q_auto,w_400/v1703001234/articles/x.jpg`,
    )
  })

  it('width+height: injects c_fill,g_auto transformation', () => {
    const result = cloudinaryThumbUrl(ORIG, 400, 300)
    expect(result).toBe(
      `${CLOUD}/image/upload/c_fill,g_auto,f_auto,q_auto,w_400,h_300/v1703001234/articles/x.jpg`,
    )
  })

  it('returns input unchanged when transformations already present', () => {
    const withTransform = `${CLOUD}/image/upload/c_fill,w_200/v1/x.jpg`
    expect(cloudinaryThumbUrl(withTransform, 400)).toBe(withTransform)
  })

  it('returns input unchanged for non-Cloudinary URLs', () => {
    expect(cloudinaryThumbUrl('https://example.com/x.png', 400)).toBe(
      'https://example.com/x.png',
    )
  })

  it('returns empty input unchanged', () => {
    expect(cloudinaryThumbUrl('', 400)).toBe('')
  })

  it('returns input unchanged when /upload/ segment missing', () => {
    const noUpload = `${CLOUD}/image/v1/x.jpg`
    expect(cloudinaryThumbUrl(noUpload, 400)).toBe(noUpload)
  })

  it('handles malformed URL gracefully (catches throw)', () => {
    expect(cloudinaryThumbUrl('not-a-url', 400)).toBe('not-a-url')
  })
})

describe('resourceTypeFromUrl', () => {
  it.each([
    [`${CLOUD}/image/upload/v1/x.jpg`, 'image'],
    [`${CLOUD}/raw/upload/v1/x.pdf`, 'raw'],
    [`${CLOUD}/video/upload/v1/x.mp4`, 'video'],
  ])('%s → %s', (url, expected) => {
    expect(resourceTypeFromUrl(url)).toBe(expected)
  })

  it('returns null for non-Cloudinary URL', () => {
    expect(resourceTypeFromUrl('https://example.com/x.png')).toBeNull()
  })

  it('returns null for empty / malformed input', () => {
    expect(resourceTypeFromUrl('')).toBeNull()
    expect(resourceTypeFromUrl('not-a-url')).toBeNull()
  })

  it('returns null when segment before /upload/ is unrecognised', () => {
    expect(resourceTypeFromUrl(`${CLOUD}/audio/upload/v1/x.mp3`)).toBeNull()
  })

  it('returns null when /upload/ is the first path segment (no kind to inspect)', () => {
    expect(resourceTypeFromUrl(`${CLOUD}/upload/v1/x.jpg`)).toBeNull()
  })
})

describe('MIME_TO_EXT mapping', () => {
  it.each([
    ['application/pdf', '.pdf'],
    ['application/msword', '.doc'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/svg+xml', '.svg'],
    ['video/mp4', '.mp4'],
    ['video/quicktime', '.mov'],
    ['text/plain', '.txt'],
    ['text/markdown', '.md'],
  ])('maps %s → %s', (mime, ext) => {
    expect(MIME_TO_EXT[mime]).toBe(ext)
  })

  it('returns undefined for unknown MIME', () => {
    expect(MIME_TO_EXT['application/x-unknown']).toBeUndefined()
  })
})
