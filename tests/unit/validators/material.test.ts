import { describe, expect, it } from 'vitest'
import {
  createMaterialSchema,
  updateMaterialSchema,
  isAllowedExternalVideoUrl,
} from '@/lib/validators/material'

const baseFields = {
  title: 'Naslov',
  description: null,
  fileSize: null,
  mimeType: null,
  sortOrder: 0,
}

describe('createMaterialSchema — discriminated union by scope', () => {
  it('accepts a MODULE-scoped DOCUMENT with fileUrl', () => {
    const result = createMaterialSchema.parse({
      ...baseFields,
      scope: 'MODULE',
      moduleId: 'm1',
      type: 'DOCUMENT',
      fileUrl: 'https://example.com/file.pdf',
      externalUrl: null,
    })
    expect(result.scope).toBe('MODULE')
  })

  it('accepts a COURSE-scoped LINK with externalUrl', () => {
    const result = createMaterialSchema.parse({
      ...baseFields,
      scope: 'COURSE',
      courseId: 'c1',
      type: 'LINK',
      fileUrl: null,
      externalUrl: 'https://wikipedia.org',
    })
    expect(result.scope).toBe('COURSE')
  })

  it('accepts a GROUP-scoped VIDEO with fileUrl (Cloudinary)', () => {
    const result = createMaterialSchema.parse({
      ...baseFields,
      scope: 'GROUP',
      scheduledGroupId: 'g1',
      type: 'VIDEO',
      fileUrl: 'https://res.cloudinary.com/x/video/upload/v1/x.mp4',
      externalUrl: null,
    })
    expect(result.scope).toBe('GROUP')
  })

  it('accepts a GROUP-scoped VIDEO with YouTube externalUrl', () => {
    const result = createMaterialSchema.parse({
      ...baseFields,
      scope: 'GROUP',
      scheduledGroupId: 'g1',
      type: 'VIDEO',
      fileUrl: null,
      externalUrl: 'https://www.youtube.com/watch?v=abc',
    })
    expect(result.scope).toBe('GROUP')
  })

  it('rejects MODULE without moduleId', () => {
    const result = createMaterialSchema.safeParse({
      ...baseFields,
      scope: 'MODULE',
      type: 'DOCUMENT',
      fileUrl: 'https://example.com/x.pdf',
      externalUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects COURSE without courseId', () => {
    const result = createMaterialSchema.safeParse({
      ...baseFields,
      scope: 'COURSE',
      type: 'DOCUMENT',
      fileUrl: 'https://example.com/x.pdf',
      externalUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown scope value', () => {
    const result = createMaterialSchema.safeParse({
      ...baseFields,
      scope: 'BOGUS',
      type: 'DOCUMENT',
      fileUrl: 'https://example.com/x.pdf',
    })
    expect(result.success).toBe(false)
  })
})

describe('createMaterialSchema — type/URL pairing rules', () => {
  const moduleBase = { ...baseFields, scope: 'MODULE' as const, moduleId: 'm1' }

  it('rejects DOCUMENT without fileUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'DOCUMENT',
      fileUrl: null,
      externalUrl: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('fileUrl'))).toBe(true)
    }
  })

  it('rejects DOCUMENT with externalUrl set', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'DOCUMENT',
      fileUrl: 'https://example.com/x.pdf',
      externalUrl: 'https://x.com',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('externalUrl'))).toBe(true)
    }
  })

  it('rejects VIDEO with both fileUrl AND externalUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'VIDEO',
      fileUrl: 'https://x.com/v.mp4',
      externalUrl: 'https://youtu.be/x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects VIDEO with neither fileUrl NOR externalUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'VIDEO',
      fileUrl: null,
      externalUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects VIDEO with non-YouTube/Vimeo externalUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'VIDEO',
      fileUrl: null,
      externalUrl: 'https://dailymotion.com/x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('YouTube'))).toBe(true)
    }
  })

  it('accepts VIDEO with Vimeo URL', () => {
    const result = createMaterialSchema.parse({
      ...moduleBase,
      type: 'VIDEO',
      fileUrl: null,
      externalUrl: 'https://vimeo.com/123',
    })
    expect(result.externalUrl).toBe('https://vimeo.com/123')
  })

  it('rejects LINK without externalUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'LINK',
      fileUrl: null,
      externalUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects LINK with fileUrl set', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'LINK',
      fileUrl: 'https://x.com/file.pdf',
      externalUrl: 'https://x.com',
    })
    expect(result.success).toBe(false)
  })
})

describe('createMaterialSchema — ROBOCAMP type', () => {
  const moduleBase = { ...baseFields, scope: 'MODULE' as const, moduleId: 'm1' }

  it('accepts ROBOCAMP with an elearning.robocamp.eu externalUrl', () => {
    const result = createMaterialSchema.parse({
      ...moduleBase,
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: 'https://elearning.robocamp.eu/course/123',
    })
    expect(result.type).toBe('ROBOCAMP')
    expect(result.externalUrl).toBe('https://elearning.robocamp.eu/course/123')
  })

  it('rejects ROBOCAMP without externalUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: null,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('externalUrl'))).toBe(true)
    }
  })

  it('rejects ROBOCAMP with a non-robocamp host', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: 'https://www.youtube.com/watch?v=x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('robocamp'))).toBe(true)
    }
  })

  it('rejects ROBOCAMP with a fileUrl', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'ROBOCAMP',
      fileUrl: 'https://res.cloudinary.com/x/raw/upload/v1/x.pdf',
      externalUrl: 'https://elearning.robocamp.eu/course/123',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('fileUrl'))).toBe(true)
    }
  })

  it('rejects ROBOCAMP that looks like robocamp but on a different host', () => {
    const result = createMaterialSchema.safeParse({
      ...moduleBase,
      type: 'ROBOCAMP',
      fileUrl: null,
      externalUrl: 'https://elearning.robocamp.eu.evil.com/course/123',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateMaterialSchema', () => {
  it('accepts an id-only update (no type → skip pairing check)', () => {
    const result = updateMaterialSchema.parse({ id: 'm1' })
    expect(result.id).toBe('m1')
  })

  it('enforces pairing when type is provided', () => {
    const result = updateMaterialSchema.safeParse({
      id: 'm1',
      type: 'DOCUMENT',
      fileUrl: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown fields (strict)', () => {
    const result = updateMaterialSchema.safeParse({ id: 'm1', bogus: 1 })
    expect(result.success).toBe(false)
  })
})

describe('isAllowedExternalVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=x', true],
    ['https://youtu.be/x', true],
    ['https://player.vimeo.com/video/x', true],
    ['https://dailymotion.com/x', false],
    ['not-a-url', false],
    ['', false],
  ])('returns %s for %s', (url, expected) => {
    expect(isAllowedExternalVideoUrl(url)).toBe(expected)
  })
})
