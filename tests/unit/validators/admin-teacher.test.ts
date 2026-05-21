import { describe, expect, it } from 'vitest'
import {
  createTeacherSchema,
  updateTeacherSchema,
  assignTeacherSchema,
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
    })
    expect(result.id).toBe('t1')
  })

  it('rejects empty id', () => {
    expect(
      updateTeacherSchema.safeParse({ id: '', firstName: 'Iva', lastName: 'Marić' }).success,
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
