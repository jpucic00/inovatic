import { describe, expect, it } from 'vitest'
import {
  createTeacherSchema,
  updateTeacherSchema,
  assignTeacherSchema,
  updateTeacherHourlyRateSchema,
} from '@/lib/validators/admin/teacher'

describe('createTeacherSchema', () => {
  it('accepts a valid teacher', () => {
    const result = createTeacherSchema.parse({
      email: 't@example.com',
      firstName: 'Iva',
      lastName: 'Marić',
    })
    expect(result.email).toBe('t@example.com')
  })

  it('accepts optional phone (string or null)', () => {
    expect(
      createTeacherSchema.parse({
        email: 't@example.com',
        firstName: 'Iva',
        lastName: 'Marić',
        phone: null,
      }).phone,
    ).toBeNull()
  })

  it('rejects invalid email', () => {
    expect(
      createTeacherSchema.safeParse({
        email: 'not-email',
        firstName: 'Iva',
        lastName: 'Marić',
      }).success,
    ).toBe(false)
  })

  it('rejects firstName < 2 chars', () => {
    expect(
      createTeacherSchema.safeParse({
        email: 't@example.com',
        firstName: 'I',
        lastName: 'Marić',
      }).success,
    ).toBe(false)
  })

  it('rejects lastName < 2 chars', () => {
    expect(
      createTeacherSchema.safeParse({
        email: 't@example.com',
        firstName: 'Iva',
        lastName: 'M',
      }).success,
    ).toBe(false)
  })
})

describe('updateTeacherSchema', () => {
  it('accepts a valid update', () => {
    const result = updateTeacherSchema.parse({
      id: 't1',
      firstName: 'Iva',
      lastName: 'Marić',
      email: 'iva@example.com',
    })
    expect(result.id).toBe('t1')
    expect(result.email).toBe('iva@example.com')
  })

  it('rejects empty id', () => {
    expect(
      updateTeacherSchema.safeParse({
        id: '',
        firstName: 'Iva',
        lastName: 'Marić',
        email: 'iva@example.com',
      }).success,
    ).toBe(false)
  })

  it('requires a valid email', () => {
    expect(
      updateTeacherSchema.safeParse({ id: 't1', firstName: 'Iva', lastName: 'Marić' }).success,
    ).toBe(false)
    expect(
      updateTeacherSchema.safeParse({
        id: 't1',
        firstName: 'Iva',
        lastName: 'Marić',
        email: 'not-email',
      }).success,
    ).toBe(false)
  })
})

describe('updateTeacherHourlyRateSchema', () => {
  const parse = (hourlyRateCents: unknown) =>
    updateTeacherHourlyRateSchema.safeParse({ id: 't1', hourlyRateCents })

  it('converts euros to cents, with either decimal separator', () => {
    // A Croatian keyboard produces the comma; a paste may bring the dot.
    expect(parse('12,50').success && parse('12,50').data?.hourlyRateCents).toBe(1250)
    expect(parse('12.50').success && parse('12.50').data?.hourlyRateCents).toBe(1250)
    expect(parse(' 9 ').success && parse(' 9 ').data?.hourlyRateCents).toBe(900)
  })

  it('rounds to whole cents', () => {
    expect(parse('12,505').success && parse('12,505').data?.hourlyRateCents).toBe(1251)
  })

  it('treats a blank input as clearing the rate, not as zero', () => {
    expect(parse('').data?.hourlyRateCents).toBeNull()
    expect(parse('   ').data?.hourlyRateCents).toBeNull()
    expect(parse(null).data?.hourlyRateCents).toBeNull()
  })

  it('keeps an explicit zero distinct from a cleared rate', () => {
    expect(parse('0').data?.hourlyRateCents).toBe(0)
  })

  it('rejects garbage rather than silently wiping the rate', () => {
    expect(parse('abc').success).toBe(false)
    expect(parse('12,5,0').success).toBe(false)
  })

  it('rejects a negative rate and an implausible one', () => {
    expect(parse('-1').success).toBe(false)
    expect(parse('5000').success).toBe(false)
  })

  it('rejects an empty id', () => {
    expect(
      updateTeacherHourlyRateSchema.safeParse({ id: '', hourlyRateCents: '12' }).success,
    ).toBe(false)
  })
})

describe('assignTeacherSchema', () => {
  it('accepts teacherId + scheduledGroupId', () => {
    expect(
      assignTeacherSchema.parse({ teacherId: 't1', scheduledGroupId: 'g1' }).teacherId,
    ).toBe('t1')
  })

  it('rejects empty teacherId', () => {
    expect(
      assignTeacherSchema.safeParse({ teacherId: '', scheduledGroupId: 'g1' }).success,
    ).toBe(false)
  })
})
