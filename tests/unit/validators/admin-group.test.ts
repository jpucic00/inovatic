import { describe, expect, it } from 'vitest'
import { createGroupSchema, updateGroupSchema } from '@/lib/validators/admin/group'

const validGroup = {
  courseId: 'c1',
  locationId: 'loc1',
  name: 'SLR1 Pon 17h',
  startTime: '17:00',
  endTime: '18:30',
  maxStudents: 12,
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

  it('accepts empty dateStart/dateEnd/dayOfWeek strings', () => {
    const result = createGroupSchema.parse({
      ...validGroup,
      dateStart: '',
      dateEnd: '',
      dayOfWeek: '',
    })
    expect(result.dateStart).toBe('')
    expect(result.dateEnd).toBe('')
  })

  it('accepts a full radionica date range', () => {
    const result = createGroupSchema.parse({
      ...validGroup,
      dateStart: '2026-07-15',
      dateEnd: '2026-07-21',
    })
    expect(result.dateStart).toBe('2026-07-15')
    expect(result.dateEnd).toBe('2026-07-21')
  })

  it('accepts a single-day radionica range (start === end)', () => {
    const result = createGroupSchema.parse({
      ...validGroup,
      dateStart: '2026-07-15',
      dateEnd: '2026-07-15',
    })
    expect(result.dateStart).toBe('2026-07-15')
  })

  it('rejects dateStart without dateEnd', () => {
    const res = createGroupSchema.safeParse({ ...validGroup, dateStart: '2026-07-15' })
    expect(res.success).toBe(false)
  })

  it('rejects dateEnd without dateStart', () => {
    const res = createGroupSchema.safeParse({ ...validGroup, dateEnd: '2026-07-21' })
    expect(res.success).toBe(false)
  })

  it('rejects dateEnd before dateStart', () => {
    const res = createGroupSchema.safeParse({
      ...validGroup,
      dateStart: '2026-07-21',
      dateEnd: '2026-07-15',
    })
    expect(res.success).toBe(false)
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
