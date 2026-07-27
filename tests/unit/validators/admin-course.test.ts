import { describe, expect, it } from 'vitest'
import { createCourseSchema, updateCourseSchema } from '@/lib/validators/admin/course'

const validCourse = {
  title: 'SLR 1',
  description: 'Opis programa',
  ageMin: 6,
  ageMax: 10,
}

describe('createCourseSchema', () => {
  it('accepts a minimal valid course', () => {
    const result = createCourseSchema.parse(validCourse)
    expect(result.title).toBe('SLR 1')
  })

  it('coerces ageMin/ageMax from strings', () => {
    const result = createCourseSchema.parse({ ...validCourse, ageMin: '8', ageMax: '12' })
    expect(result.ageMin).toBe(8)
    expect(result.ageMax).toBe(12)
  })

  it('accepts price + imageUrl', () => {
    const result = createCourseSchema.parse({
      ...validCourse,
      price: '50',
      imageUrl: 'https://example.com/img.png',
    })
    expect(result.price).toBe(50)
    expect(result.imageUrl).toBe('https://example.com/img.png')
  })

  it('accepts empty-string imageUrl', () => {
    const result = createCourseSchema.parse({ ...validCourse, imageUrl: '' })
    expect(result.imageUrl).toBe('')
  })

  it('rejects ageMin < 3', () => {
    expect(createCourseSchema.safeParse({ ...validCourse, ageMin: 2 }).success).toBe(false)
  })

  it('rejects ageMax > 18', () => {
    expect(createCourseSchema.safeParse({ ...validCourse, ageMax: 19 }).success).toBe(false)
  })

  it('rejects price <= 0', () => {
    expect(createCourseSchema.safeParse({ ...validCourse, price: 0 }).success).toBe(false)
  })

  it('rejects title shorter than 2 chars', () => {
    expect(createCourseSchema.safeParse({ ...validCourse, title: 'S' }).success).toBe(false)
  })

  it('rejects description shorter than 5 chars', () => {
    expect(createCourseSchema.safeParse({ ...validCourse, description: 'Op' }).success).toBe(false)
  })

  it('rejects invalid imageUrl (non-URL non-empty)', () => {
    expect(
      createCourseSchema.safeParse({ ...validCourse, imageUrl: 'not-url' }).success,
    ).toBe(false)
  })

  // An emptied number input posts '' — coercion would make it 0 and trip
  // .positive(), so a radionica without a price could not be saved at all.
  it('treats an empty price as "no price"', () => {
    const result = createCourseSchema.parse({ ...validCourse, price: '' })
    expect(result.price).toBeUndefined()
  })

  it('treats a null price as "no price"', () => {
    const result = createCourseSchema.parse({ ...validCourse, price: null })
    expect(result.price).toBeUndefined()
  })
})

describe('updateCourseSchema', () => {
  const validUpdate = { ...validCourse, id: 'course-1' }

  it('accepts a valid update', () => {
    const result = updateCourseSchema.parse(validUpdate)
    expect(result.id).toBe('course-1')
    expect(result.title).toBe('SLR 1')
  })

  it('requires an id', () => {
    expect(updateCourseSchema.safeParse(validCourse).success).toBe(false)
    expect(updateCourseSchema.safeParse({ ...validUpdate, id: '' }).success).toBe(false)
  })

  it('inherits the field rules from createCourseSchema', () => {
    expect(updateCourseSchema.safeParse({ ...validUpdate, title: 'S' }).success).toBe(false)
    expect(updateCourseSchema.safeParse({ ...validUpdate, ageMax: 19 }).success).toBe(false)
    expect(updateCourseSchema.safeParse({ ...validUpdate, price: 0 }).success).toBe(false)
    expect(updateCourseSchema.parse({ ...validUpdate, price: '' }).price).toBeUndefined()
  })

  // imageUrl is omitted rather than optional: the edit dialog has no such
  // field, so an update must never be able to blank a stored image.
  it('drops imageUrl instead of writing it', () => {
    const result = updateCourseSchema.parse({
      ...validUpdate,
      imageUrl: 'https://example.com/img.png',
    })
    expect(result).not.toHaveProperty('imageUrl')
  })
})
