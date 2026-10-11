import { describe, expect, it } from 'vitest'
import {
  GALLERY_ACCEPT,
  GALLERY_MAX_BYTES,
  galleryFileError,
  galleryUploadErrorMessage,
} from '@/lib/gallery-upload-rules'

describe('galleryFileError', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('accepts %s', (type) => {
    expect(galleryFileError({ type, size: 1024 })).toBeNull()
  })

  // The picker has to refuse exactly what the route refuses, or a staged image
  // only fails after the teacher has waited for its upload.
  it.each(['image/heic', 'image/svg+xml', 'application/pdf', ''])('refuses %s', (type) => {
    expect(galleryFileError({ type, size: 1024 })).toMatch(/nepodržan format/)
  })

  it('accepts an image of exactly the limit and refuses one byte more', () => {
    expect(galleryFileError({ type: 'image/png', size: GALLERY_MAX_BYTES })).toBeNull()
    expect(galleryFileError({ type: 'image/png', size: GALLERY_MAX_BYTES + 1 })).toBe('veća od 10 MB')
  })

  it('names the limit the copy states', () => {
    expect(GALLERY_MAX_BYTES).toBe(10 * 1024 * 1024)
  })

  it('offers the picker the same four types', () => {
    expect(GALLERY_ACCEPT.split(',').sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('galleryUploadErrorMessage', () => {
  it.each([
    ['network', /Veza je prekinuta/],
    [401, /prijavite se ponovno/],
    [413, /najviše 10 MB/],
    [415, /Nepodržan format/],
    [500, /^Prijenos nije uspio\.$/],
    [0, /^Prijenos nije uspio\.$/],
  ] as const)('words %s', (status, expected) => {
    expect(galleryUploadErrorMessage(status)).toMatch(expected)
  })
})
