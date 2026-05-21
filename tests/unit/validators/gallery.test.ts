import { describe, expect, it } from 'vitest'
import { addGalleryImagesSchema } from '@/lib/validators/gallery'

const validImage = {
  url: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1/gallery/x.png',
  publicId: 'gallery/x',
  width: 800,
  height: 600,
  caption: 'Test',
}

describe('addGalleryImagesSchema', () => {
  it('accepts a standard-program payload with moduleId set', () => {
    const result = addGalleryImagesSchema.parse({
      scheduledGroupId: 'g1',
      moduleId: 'm1',
      images: [validImage],
    })
    expect(result.images).toHaveLength(1)
    expect(result.moduleId).toBe('m1')
  })

  it('accepts a radionica payload with moduleId explicitly null', () => {
    // Note: the standard-vs-radionica gate (must-be-null vs required) lives in
    // src/actions/gallery/crud.ts, not the validator. The validator itself
    // only enforces that moduleId is a string-or-null.
    const result = addGalleryImagesSchema.parse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [validImage],
    })
    expect(result.moduleId).toBeNull()
  })

  it('accepts up to 50 images in one batch', () => {
    const result = addGalleryImagesSchema.parse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: Array.from({ length: 50 }, (_, i) => ({
        ...validImage,
        publicId: `gallery/x-${i}`,
      })),
    })
    expect(result.images).toHaveLength(50)
  })

  it('rejects more than 50 images', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: Array.from({ length: 51 }, () => validImage),
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty images array', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects image with non-URL url', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [{ ...validImage, url: 'not-a-url' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects image with empty publicId', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [{ ...validImage, publicId: '' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative width/height', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [{ ...validImage, width: -1 }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts width/height as null or undefined', () => {
    const result = addGalleryImagesSchema.parse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [{ url: validImage.url, publicId: 'x', width: null, height: undefined }],
    })
    expect(result.images[0].width).toBeNull()
  })

  it('rejects caption longer than 500 chars', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: 'g1',
      moduleId: null,
      images: [{ ...validImage, caption: 'x'.repeat(501) }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty scheduledGroupId', () => {
    const result = addGalleryImagesSchema.safeParse({
      scheduledGroupId: '',
      moduleId: null,
      images: [validImage],
    })
    expect(result.success).toBe(false)
  })
})
