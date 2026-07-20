import { describe, expect, it } from 'vitest'
import {
  identityKey,
  legacyIdentityKey,
  legacyIdentityWhere,
  studentIdentityWhere,
} from '@/lib/student-match'

describe('identityKey', () => {
  it('builds a normalized lower|lower|dob key', () => {
    expect(identityKey('Luka', 'Horvat', '2015-04-01')).toBe('luka|horvat|2015-04-01')
  })

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(identityKey('  LUKA ', 'HORVAT', '2015-04-01')).toBe(
      identityKey('luka', 'horvat', '2015-04-01'),
    )
  })

  it('returns null without a date of birth', () => {
    expect(identityKey('Luka', 'Horvat', null)).toBeNull()
    expect(identityKey('Luka', 'Horvat', undefined)).toBeNull()
    expect(identityKey('Luka', 'Horvat', '')).toBeNull()
  })

  it('differs when the date of birth differs', () => {
    expect(identityKey('Luka', 'Horvat', '2015-04-01')).not.toBe(
      identityKey('Luka', 'Horvat', '2016-04-01'),
    )
  })
})

describe('studentIdentityWhere', () => {
  it('builds a STUDENT where-clause when a DOB is present', () => {
    expect(
      studentIdentityWhere({ firstName: 'Luka', lastName: 'Horvat', dateOfBirth: '2015-04-01' }),
    ).toEqual({
      role: 'STUDENT',
      firstName: { equals: 'Luka', mode: 'insensitive' },
      lastName: { equals: 'Horvat', mode: 'insensitive' },
      dateOfBirth: '2015-04-01',
    })
  })

  it('returns null without a date of birth (name alone never matches)', () => {
    expect(studentIdentityWhere({ firstName: 'Luka', lastName: 'Horvat' })).toBeNull()
    expect(
      studentIdentityWhere({ firstName: 'Luka', lastName: 'Horvat', dateOfBirth: null }),
    ).toBeNull()
  })
})

describe('legacyIdentityWhere', () => {
  it('targets only DOB-less students by name + parent email (insensitive)', () => {
    expect(
      legacyIdentityWhere({
        firstName: 'Luka',
        lastName: 'Horvat',
        parentEmail: ' Mama@Example.com ',
      }),
    ).toEqual({
      role: 'STUDENT',
      dateOfBirth: null,
      firstName: { equals: 'Luka', mode: 'insensitive' },
      lastName: { equals: 'Horvat', mode: 'insensitive' },
      parentEmail: { equals: 'Mama@Example.com', mode: 'insensitive' },
    })
  })

  it('returns null without a parent email — email is what asserts the family', () => {
    expect(legacyIdentityWhere({ firstName: 'Luka', lastName: 'Horvat' })).toBeNull()
    expect(
      legacyIdentityWhere({ firstName: 'Luka', lastName: 'Horvat', parentEmail: '' }),
    ).toBeNull()
  })

  it('returns null for blank names so PARTY inquiries can never match by email alone', () => {
    expect(
      legacyIdentityWhere({ firstName: '', lastName: '', parentEmail: 'mama@example.com' }),
    ).toBeNull()
    expect(
      legacyIdentityWhere({ firstName: 'Luka', lastName: ' ', parentEmail: 'mama@example.com' }),
    ).toBeNull()
  })
})

describe('legacyIdentityKey', () => {
  it('normalizes names and email the way the DB comparison does', () => {
    expect(legacyIdentityKey('  LUKA ', 'HORVAT', ' Mama@Example.COM ')).toBe(
      'luka|horvat|mama@example.com',
    )
  })

  it('returns null when email or a name part is missing', () => {
    expect(legacyIdentityKey('Luka', 'Horvat', null)).toBeNull()
    expect(legacyIdentityKey('Luka', 'Horvat', '')).toBeNull()
    expect(legacyIdentityKey('', 'Horvat', 'mama@example.com')).toBeNull()
  })

  it('never collides with a strict identity key', () => {
    // Same shape (a|b|c) but the third segment is an email, which always
    // contains '@' — a DOB string never does.
    expect(legacyIdentityKey('Luka', 'Horvat', 'mama@example.com')).not.toBe(
      identityKey('Luka', 'Horvat', 'mama@example.com'.replace('@', '-')),
    )
  })
})
