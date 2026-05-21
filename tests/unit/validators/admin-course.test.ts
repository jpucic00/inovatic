import { describe, expect, it } from 'vitest'
import { createCourseSchema } from '@/lib/validators/admin/course'

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
})
