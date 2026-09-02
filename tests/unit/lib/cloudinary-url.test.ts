import { describe, expect, it } from 'vitest'
import {
  MIME_TO_EXT,
  WATERMARK_TRANSFORM,
  cloudinaryThumbUrl,
  hasWatermark,
  publicIdFromUrl,
  removedAssetUrls,
  resourceTypeFromUrl,
  sanitiseFilename,
  stripWatermark,
  withWatermark,
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

  it('drops transformation segments so the id names the real asset', () => {
    // Load-bearing: destroyCloudinaryAssets re-derives the id from the STORED
    // url, and stored urls carry a watermark overlay. Returning the transform
    // as part of the id orphans every deleted image in Cloudinary.
    expect(publicIdFromUrl(`${CLOUD}/image/upload/c_fill,w_400/v1/articles/x.jpg`)).toBe(
      'articles/x',
    )
    expect(
      publicIdFromUrl(`${CLOUD}/image/upload/${WATERMARK_TRANSFORM}/v1/articles/x.jpg`),
    ).toBe('articles/x')
    expect(
      publicIdFromUrl(
        `${CLOUD}/image/upload/c_fill,w_400/${WATERMARK_TRANSFORM}/v1/articles/x.jpg`,
      ),
    ).toBe('articles/x')
  })

  it('resolves a video public id the same way (article bodies hold video/upload urls)', () => {
    expect(publicIdFromUrl(`${CLOUD}/video/upload/v1/articles/inline/saonice.mp4`)).toBe(
      'articles/inline/saonice',
    )
  })

  it('keeps a folder that merely looks wordy (no key_value shape)', () => {
    expect(
      publicIdFromUrl(`${CLOUD}/image/upload/articles/gallery/prvi-ciklus/01.jpg`),
    ).toBe('articles/gallery/prvi-ciklus/01')
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

  it('returns input unchanged when a sizing transformation is already present', () => {
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

describe('cloudinaryThumbUrl + watermark', () => {
  const WATERMARKED = `${CLOUD}/image/upload/${WATERMARK_TRANSFORM}/v1/articles/x.jpg`

  it('puts the resize IN FRONT of an existing watermark overlay', () => {
    // Order is the point: Cloudinary chains left to right, so the logo is
    // layered onto the finished thumbnail at a constant proportion of it
    // rather than being shrunk and cropped along with the photo.
    expect(cloudinaryThumbUrl(WATERMARKED, 400, 400)).toBe(
      `${CLOUD}/image/upload/c_fill,g_auto,f_auto,q_auto,w_400,h_400/` +
        `${WATERMARK_TRANSFORM}/v1/articles/x.jpg`,
    )
  })

  it('does not mistake the overlay’s own w_ for a base resize', () => {
    // The watermark carries w_0.28 to size ITSELF. Reading that as "already
    // sized" made the helper bail, and every grid served full-size images.
    expect(cloudinaryThumbUrl(WATERMARKED, 400)).not.toBe(WATERMARKED)
  })

  it('thumbnails a versionless url (previously bailed, serving full size)', () => {
    const versionless = `${CLOUD}/image/upload/articles/gallery/prvi-ciklus/01.jpg`
    expect(cloudinaryThumbUrl(versionless, 400, 400)).toBe(
      `${CLOUD}/image/upload/c_fill,g_auto,f_auto,q_auto,w_400,h_400/` +
        `articles/gallery/prvi-ciklus/01.jpg`,
    )
  })
})

describe('withWatermark', () => {
  const ORIG = `${CLOUD}/image/upload/v1703001234/articles/covers/x.jpg`

  it('splices the overlay in directly after /image/upload/', () => {
    expect(withWatermark(ORIG)).toBe(
      `${CLOUD}/image/upload/${WATERMARK_TRANSFORM}/v1703001234/articles/covers/x.jpg`,
    )
  })

  it('works on a versionless url', () => {
    const versionless = `${CLOUD}/image/upload/articles/gallery/prvi-ciklus/01.jpg`
    expect(withWatermark(versionless)).toBe(
      `${CLOUD}/image/upload/${WATERMARK_TRANSFORM}/articles/gallery/prvi-ciklus/01.jpg`,
    )
  })

  it('is idempotent', () => {
    const once = withWatermark(ORIG)
    expect(withWatermark(once)).toBe(once)
  })

  it('goes BEHIND a resize already in the chain, never in front of it', () => {
    // Same ordering rule cloudinaryThumbUrl enforces from the other side: the
    // overlay must be drawn on the finished thumbnail, not shrunk with the photo.
    const sized = `${CLOUD}/image/upload/c_fill,g_auto,w_400,h_400/v1/articles/x.jpg`
    expect(withWatermark(sized)).toBe(
      `${CLOUD}/image/upload/c_fill,g_auto,w_400,h_400/${WATERMARK_TRANSFORM}/v1/articles/x.jpg`,
    )
    // Which makes the two helpers commute: thumb-then-watermark and
    // watermark-then-thumb spell the same url, so no call site has to care
    // which one ran first.
    const plain = `${CLOUD}/image/upload/v1/articles/x.jpg`
    expect(withWatermark(cloudinaryThumbUrl(plain, 400, 400))).toBe(
      cloudinaryThumbUrl(withWatermark(plain), 400, 400),
    )
  })

  it('leaves video and raw assets alone', () => {
    const video = `${CLOUD}/video/upload/v1/articles/inline/saonice.mp4`
    const raw = `${CLOUD}/raw/upload/v1/materials/plan.pdf`
    expect(withWatermark(video)).toBe(video)
    expect(withWatermark(raw)).toBe(raw)
  })

  it('leaves non-Cloudinary, empty and malformed input alone', () => {
    expect(withWatermark('https://example.com/x.png')).toBe('https://example.com/x.png')
    expect(withWatermark('/images/courses/slr-1/cover.webp')).toBe(
      '/images/courses/slr-1/cover.webp',
    )
    expect(withWatermark('')).toBe('')
    expect(withWatermark('not-a-url')).toBe('not-a-url')
  })
})

describe('stripWatermark', () => {
  const ORIG = `${CLOUD}/image/upload/v1703001234/articles/covers/x.jpg`

  it('round-trips with withWatermark', () => {
    expect(stripWatermark(withWatermark(ORIG))).toBe(ORIG)
  })

  it('keeps every other transformation in place', () => {
    const both =
      `${CLOUD}/image/upload/c_fill,g_auto,w_400,h_400/${WATERMARK_TRANSFORM}` +
      `/v1/articles/x.jpg`
    expect(stripWatermark(both)).toBe(
      `${CLOUD}/image/upload/c_fill,g_auto,w_400,h_400/v1/articles/x.jpg`,
    )
  })

  it('is a no-op on an unwatermarked url', () => {
    expect(stripWatermark(ORIG)).toBe(ORIG)
  })

  it('round-trips a thumbnail chain too (resize in front, overlay behind)', () => {
    const thumb = cloudinaryThumbUrl(ORIG, 400, 400)
    expect(stripWatermark(withWatermark(thumb))).toBe(thumb)
  })
})

describe('hasWatermark', () => {
  it('distinguishes watermarked from plain urls', () => {
    const orig = `${CLOUD}/image/upload/v1/articles/x.jpg`
    expect(hasWatermark(orig)).toBe(false)
    expect(hasWatermark(withWatermark(orig))).toBe(true)
  })
})

describe('removedAssetUrls', () => {
  const ORIG = `${CLOUD}/image/upload/v1/articles/x.jpg`
  const KEPT = `${CLOUD}/image/upload/v1/articles/kept.jpg`

  it('treats two spellings of one asset as the same image', () => {
    // The regression this exists to prevent: the backfill rewrites stored urls,
    // so an editor tab opened beforehand submits the un-watermarked spelling of
    // an image it still contains. A raw string diff would destroy it.
    expect(removedAssetUrls([withWatermark(ORIG)], [ORIG])).toEqual([])
    expect(removedAssetUrls([ORIG], [withWatermark(ORIG)])).toEqual([])
  })

  it('ignores differing delivery transformations', () => {
    expect(removedAssetUrls([cloudinaryThumbUrl(ORIG, 400)], [ORIG])).toEqual([])
  })

  it('still reports genuinely removed assets', () => {
    expect(removedAssetUrls([ORIG, KEPT], [KEPT])).toEqual([ORIG])
  })

  it('deduplicates several urls pointing at one removed asset', () => {
    expect(removedAssetUrls([ORIG, withWatermark(ORIG)], [])).toHaveLength(1)
  })

  it('falls back to string identity for non-Cloudinary urls', () => {
    expect(removedAssetUrls(['https://example.com/a.png'], [])).toEqual([
      'https://example.com/a.png',
    ])
    expect(
      removedAssetUrls(['https://example.com/a.png'], ['https://example.com/a.png']),
    ).toEqual([])
  })
})
