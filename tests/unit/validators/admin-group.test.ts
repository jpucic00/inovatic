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

/**
 * A group saved with `endTime <= startTime` used to crash `/admin/grupe`:
 * `buildTimeBands` returned no bands and the grid indexed past the end of the
 * list. That crash is guarded defensively in the component now; this is the
 * other half — keeping the row out of the database.
 */
describe('group time range', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['18:00', '18:00'], // zero-length
    ['18:30', '08:00'], // inverted
    ['9:00', '9:00'], // one-digit hour, zero-length
    ['18:00', '9:00'], // inverted, and '9:00' > '18:00' as a STRING
  ]

  it.each(cases)('rejects %s → %s on create', (startTime, endTime) => {
    const res = createGroupSchema.safeParse({ ...validGroup, startTime, endTime })
    expect(res.success).toBe(false)
    expect(res.error?.issues.some((i) => i.path[0] === 'endTime')).toBe(true)
  })

  it.each(cases)('rejects %s → %s on update', (startTime, endTime) => {
    expect(
      updateGroupSchema.safeParse({ id: 'g1', startTime, endTime }).success,
    ).toBe(false)
  })

  // The regex allows one or two hour digits, so the comparison must be on
  // parsed minutes — '9:00' → '10:30' is valid but fails a string compare.
  it.each([
    ['9:00', '10:30'],
    ['09:00', '10:30'],
    ['17:00', '18:30'],
    ['08:00', '20:00'],
  ] as const)('accepts %s → %s', (startTime, endTime) => {
    expect(createGroupSchema.safeParse({ ...validGroup, startTime, endTime }).success).toBe(true)
  })

  it('leaves a partial update without times alone', () => {
    expect(updateGroupSchema.safeParse({ id: 'g1', maxStudents: 20 }).success).toBe(true)
    expect(updateGroupSchema.safeParse({ id: 'g1', startTime: '18:00' }).success).toBe(true)
  })

  // Two independent problems, both worth surfacing in one pass.
  it('reports a broken date pair and a broken time range together', () => {
    const res = createGroupSchema.safeParse({
      ...validGroup,
      dateStart: '2026-03-01',
      startTime: '18:00',
      endTime: '17:00',
    })
    expect(res.success).toBe(false)
    const paths = res.error?.issues.map((i) => i.path[0]) ?? []
    expect(paths).toContain('dateEnd')
    expect(paths).toContain('endTime')
  })
})
