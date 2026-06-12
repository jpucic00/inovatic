import { describe, expect, it } from 'vitest'
import { identityKey, studentIdentityWhere } from '@/lib/student-match'

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
