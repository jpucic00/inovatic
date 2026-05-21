import { describe, expect, it } from 'vitest'
import { createGroupSchema, updateGroupSchema } from '@/lib/validators/admin/group'

const validGroup = {
  courseId: 'c1',
  locationId: 'loc1',
  name: 'SLR1 Pon 17h',
  startTime: '17:00',
  endTime: '18:30',
  schoolYear: '2026/2027',
  maxStudents: 12,
  enrollmentStart: '2026-08-01',
  enrollmentEnd: '2026-09-30',
}

describe('createGroupSchema', () => {
  it('accepts a minimal valid group', () => {
    const result = createGroupSchema.parse(validGroup)
    expect(result.name).toBe('SLR1 Pon 17h')
    expect(result.maxStudents).toBe(12)
  })

  it('coerces maxStudents from string', () => {
    const result = createGroupSchema.parse({ ...validGroup, maxStudents: '15' })
    expect(result.maxStudents).toBe(15)
  })

  it('accepts optional teacherIds array', () => {
    const result = createGroupSchema.parse({ ...validGroup, teacherIds: ['t1', 't2'] })
    expect(result.teacherIds).toEqual(['t1', 't2'])
  })

  it('accepts empty date/dayOfWeek strings', () => {
    const result = createGroupSchema.parse({ ...validGroup, date: '', dayOfWeek: '' })
    expect(result.date).toBe('')
  })

  it('rejects empty courseId', () => {
    expect(createGroupSchema.safeParse({ ...validGroup, courseId: '' }).success).toBe(false)
  })

  it('rejects empty locationId', () => {
    expect(createGroupSchema.safeParse({ ...validGroup, locationId: '' }).success).toBe(false)
  })

  it('rejects maxStudents > 50', () => {
    expect(createGroupSchema.safeParse({ ...validGroup, maxStudents: 51 }).success).toBe(false)
  })

  it('rejects maxStudents < 1', () => {
    expect(createGroupSchema.safeParse({ ...validGroup, maxStudents: 0 }).success).toBe(false)
  })

  it('rejects missing enrollmentStart', () => {
    expect(createGroupSchema.safeParse({ ...validGroup, enrollmentStart: '' }).success).toBe(false)
  })
})

describe('updateGroupSchema', () => {
  it('accepts id-only update', () => {
    expect(updateGroupSchema.parse({ id: 'g1' }).id).toBe('g1')
  })

  it('accepts partial update', () => {
    const result = updateGroupSchema.parse({ id: 'g1', maxStudents: 20 })
    expect(result.maxStudents).toBe(20)
  })

  it('rejects empty id', () => {
    expect(updateGroupSchema.safeParse({ id: '' }).success).toBe(false)
  })
})
