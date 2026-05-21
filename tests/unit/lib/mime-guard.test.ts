import { describe, expect, it } from 'vitest'
import { mimeMatchesBytes } from '@/lib/mime-guard'

// Magic-byte fixtures
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const GIF_MAGIC = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])
const WEBP_MAGIC = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x24, 0x00, 0x00, 0x00, // file size
  0x57, 0x45, 0x42, 0x50, // WEBP
])
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0])
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0])
const MP4_FTYP = Buffer.from([
  0x00, 0x00, 0x00, 0x18, // size
  0x66, 0x74, 0x79, 0x70, // 'ftyp' at offset 4
  0x6d, 0x70, 0x34, 0x32, // brand
])
const MP4_MOOV = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x6d, 0x6f, 0x6f, 0x76, 0, 0, 0, 0])
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])
const PLAIN_TEXT = Buffer.from('Hello, world!')

describe('mimeMatchesBytes — accepts correct magic bytes', () => {
  it.each([
    ['image/jpeg', JPEG_MAGIC],
    ['image/png', PNG_MAGIC],
    ['image/gif', GIF_MAGIC],
    ['image/webp', WEBP_MAGIC],
    ['application/pdf', PDF_MAGIC],
    ['application/msword', OLE2_MAGIC],
    ['application/vnd.ms-powerpoint', OLE2_MAGIC],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ZIP_MAGIC,
    ],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ZIP_MAGIC,
    ],
    ['video/mp4', MP4_FTYP],
    ['video/quicktime', MP4_FTYP],
    ['video/mp4', MP4_MOOV],
    ['video/webm', WEBM_MAGIC],
  ])('returns true for declared=%s with matching magic bytes', (declared, buf) => {
    expect(mimeMatchesBytes(declared, buf)).toBe(true)
  })
})

describe('mimeMatchesBytes — rejects mismatched magic bytes', () => {
  it('returns false when declared=image/jpeg but bytes are PNG (spoofed JPEG case)', () => {
    expect(mimeMatchesBytes('image/jpeg', PNG_MAGIC)).toBe(false)
  })

  it('returns false when declared=image/png but bytes are JPEG', () => {
    expect(mimeMatchesBytes('image/png', JPEG_MAGIC)).toBe(false)
  })

  it('returns false when declared=image/webp but RIFF header missing WEBP tag', () => {
    const fakeRiff = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0, 0, 0, 0,
      0x57, 0x41, 0x56, 0x45, // WAVE — not WEBP
    ])
    expect(mimeMatchesBytes('image/webp', fakeRiff)).toBe(false)
  })

  it('returns false when declared=application/pdf but bytes lack %PDF header', () => {
    expect(mimeMatchesBytes('application/pdf', PNG_MAGIC)).toBe(false)
  })

  it('returns false when declared=video/mp4 but ftyp/moov/mdat box absent', () => {
    const badMp4 = Buffer.from([0, 0, 0, 0, 0x77, 0x77, 0x77, 0x77, 0, 0, 0, 0])
    expect(mimeMatchesBytes('video/mp4', badMp4)).toBe(false)
  })

  it('returns false when declared=video/webm but EBML magic missing', () => {
    expect(mimeMatchesBytes('video/webm', JPEG_MAGIC)).toBe(false)
  })

  it('returns false for OLE2 declaration with ZIP magic (docx as msword spoof)', () => {
    expect(mimeMatchesBytes('application/msword', ZIP_MAGIC)).toBe(false)
  })
})

describe('mimeMatchesBytes — edge cases', () => {
  it('returns false for empty buffer (< 12 bytes)', () => {
    expect(mimeMatchesBytes('image/jpeg', Buffer.alloc(0))).toBe(false)
  })

  it('returns false for truncated header (under magic-bytes length)', () => {
    expect(mimeMatchesBytes('image/jpeg', Buffer.from([0xff, 0xd8]))).toBe(false)
    expect(mimeMatchesBytes('image/jpeg', Buffer.alloc(11))).toBe(false)
  })

  it('returns true for text/plain regardless of content (no magic bytes)', () => {
    expect(mimeMatchesBytes('text/plain', PLAIN_TEXT)).toBe(true)
    expect(mimeMatchesBytes('text/plain', PNG_MAGIC)).toBe(true)
    expect(mimeMatchesBytes('text/plain', Buffer.alloc(20))).toBe(true)
  })

  it('returns true for text/markdown regardless of content', () => {
    expect(mimeMatchesBytes('text/markdown', PLAIN_TEXT)).toBe(true)
  })

  it('returns true for unknown declared MIME (default pass-through)', () => {
    // SVG rejection is enforced at the route layer (allow-list check), not here.
    expect(mimeMatchesBytes('image/svg+xml', Buffer.from('<svg></svg>0000'))).toBe(true)
    expect(mimeMatchesBytes('application/octet-stream', PNG_MAGIC)).toBe(true)
  })

  it('returns true for buffer exactly at 12-byte boundary', () => {
    const exactly12 = Buffer.alloc(12)
    exactly12[0] = 0xff
    exactly12[1] = 0xd8
    exactly12[2] = 0xff
    expect(mimeMatchesBytes('image/jpeg', exactly12)).toBe(true)
  })
})
