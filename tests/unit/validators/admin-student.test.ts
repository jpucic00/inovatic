import { describe, expect, it } from 'vitest'
import {
  createStudentSchema,
  createStudentManuallySchema,
  updateStudentSchema,
  addEnrollmentSchema,
} from '@/lib/validators/admin/student'

describe('createStudentSchema', () => {
  it('accepts inquiryId + groupId', () => {
    const result = createStudentSchema.parse({ inquiryId: 'i1', groupId: 'g1' })
    expect(result.inquiryId).toBe('i1')
  })

  it('rejects empty inquiryId', () => {
    const result = createStudentSchema.safeParse({ inquiryId: '', groupId: 'g1' })
    expect(result.success).toBe(false)
  })

  it('rejects empty groupId', () => {
    const result = createStudentSchema.safeParse({ inquiryId: 'i1', groupId: '' })
    expect(result.success).toBe(false)
  })
})

describe('createStudentManuallySchema', () => {
  const minimal = {
    firstName: 'Luka',
    lastName: 'Horvat',
    dateOfBirth: '2015-06-15',
    parentEmail: 'roditelj@example.com',
  }

  it('accepts minimal payload (names + dateOfBirth + parentEmail)', () => {
    const result = createStudentManuallySchema.parse(minimal)
    expect(result.firstName).toBe('Luka')
  })

  it('rejects a missing dateOfBirth', () => {
    const result = createStudentManuallySchema.safeParse({
      firstName: 'Luka',
      lastName: 'Horvat',
      parentEmail: 'roditelj@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty dateOfBirth', () => {
    const result = createStudentManuallySchema.safeParse({ ...minimal, dateOfBirth: '' })
    expect(result.success).toBe(false)
  })

  it('accepts all optional fields populated', () => {
    const result = createStudentManuallySchema.parse({
      ...minimal,
      dateOfBirth: '2015-06-15',
      parentName: 'Marija',
      parentEmail: 'marija@example.com',
      parentPhone: '0911234567',
      childSchool: 'OŠ Split',
      groupId: 'g1',
      moduleScheduleIds: ['ms1', 'ms2'],
    })
    expect(result.moduleScheduleIds).toEqual(['ms1', 'ms2'])
  })

  it('rejects a missing parentEmail — required for credentials + legacy matching', () => {
    const { parentEmail: _omitted, ...withoutEmail } = minimal
    const result = createStudentManuallySchema.safeParse(withoutEmail)
    expect(result.success).toBe(false)
  })

  it('rejects an empty-string parentEmail', () => {
    const result = createStudentManuallySchema.safeParse({ ...minimal, parentEmail: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid parentEmail', () => {
    const result = createStudentManuallySchema.safeParse({ ...minimal, parentEmail: 'not-email' })
    expect(result.success).toBe(false)
  })

  it('trims surrounding whitespace off parentEmail', () => {
    const result = createStudentManuallySchema.parse({
      ...minimal,
      parentEmail: ' roditelj@example.com ',
    })
    expect(result.parentEmail).toBe('roditelj@example.com')
  })

  it('rejects firstName shorter than 2 chars', () => {
    const result = createStudentManuallySchema.safeParse({ ...minimal, firstName: 'L' })
    expect(result.success).toBe(false)
  })

  it('rejects lastName shorter than 2 chars', () => {
    const result = createStudentManuallySchema.safeParse({ ...minimal, lastName: 'H' })
    expect(result.success).toBe(false)
  })
})

describe('addEnrollmentSchema', () => {
  it('accepts studentId + groupId', () => {
    expect(addEnrollmentSchema.parse({ studentId: 's1', groupId: 'g1' }).studentId).toBe('s1')
  })

  it('accepts optional moduleScheduleIds', () => {
    const result = addEnrollmentSchema.parse({
      studentId: 's1',
      groupId: 'g1',
      moduleScheduleIds: ['ms1'],
    })
    expect(result.moduleScheduleIds).toEqual(['ms1'])
  })

  it('rejects empty studentId', () => {
    expect(addEnrollmentSchema.safeParse({ studentId: '', groupId: 'g1' }).success).toBe(false)
  })
})

// Create requires parentEmail because it is the credentials recipient AND the
// legacy-tier match key for DOB-less imported students. Update used to leave it
// optional/nullable, so the Uredi dialog could clear it and break both — the
// two schemas now agree.
describe('updateStudentSchema — parentEmail parity with create', () => {
  const minimal = {
    id: 's1',
    firstName: 'Luka',
    lastName: 'Horvat',
    dateOfBirth: '2015-06-15',
    parentEmail: 'roditelj@example.com',
  }

  it('accepts a valid parent email', () => {
    expect(updateStudentSchema.parse(minimal).parentEmail).toBe('roditelj@example.com')
  })

  it('rejects clearing it to an empty string', () => {
    expect(updateStudentSchema.safeParse({ ...minimal, parentEmail: '' }).success).toBe(false)
  })

  it('rejects null and an omitted field', () => {
    expect(updateStudentSchema.safeParse({ ...minimal, parentEmail: null }).success).toBe(false)
    const { parentEmail: _omitted, ...withoutEmail } = minimal
    expect(updateStudentSchema.safeParse(withoutEmail).success).toBe(false)
  })

  it('rejects a malformed address', () => {
    expect(updateStudentSchema.safeParse({ ...minimal, parentEmail: 'nije-email' }).success).toBe(
      false,
    )
  })

  it('trims surrounding whitespace', () => {
    expect(
      updateStudentSchema.parse({ ...minimal, parentEmail: '  roditelj@example.com ' })
        .parentEmail,
    ).toBe('roditelj@example.com')
  })
})
