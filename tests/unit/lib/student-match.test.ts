import { describe, expect, it } from 'vitest'
import {
  candidateWheres,
  identityKey,
  isIdentityMatch,
  legacyIdentityKey,
  normalizeEmail,
  normalizeName,
  studentMatchKey,
} from '@/lib/student-match'

describe('normalizeName', () => {
  it('trims, collapses inner whitespace and composes to NFC', () => {
    expect(normalizeName('  Ana   Marija ')).toBe('Ana Marija')
    // c + combining acute (NFD) → precomposed ć (NFC): same glyph, one form stored.
    expect(normalizeName('Anic\u0301')).toBe('Ani\u0107')
    expect(normalizeName('Ani\u0107')).toBe('Ani\u0107')
  })
})

describe('normalizeEmail', () => {
  it('trims and collapses blank to null', () => {
    expect(normalizeEmail(' Mama@Example.com ')).toBe('Mama@Example.com')
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('identityKey', () => {
  it('builds a normalized lower|lower|dob key', () => {
    expect(identityKey('Luka', 'Horvat', '2015-04-01')).toBe('luka|horvat|2015-04-01')
  })

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(identityKey('  LUKA ', 'HORVAT', '2015-04-01')).toBe(
      identityKey('luka', 'horvat', '2015-04-01'),
    )
  })

  it('folds a trailing space — the 2026-09-06 duplicate-account case', () => {
    expect(identityKey('Ana ', 'Anić', '2018-01-01')).toBe(identityKey('Ana', 'Anić', '2018-01-01'))
  })

  it('folds diacritics in both directions, including đ', () => {
    expect(identityKey('Ana', 'Anic', '2018-01-01')).toBe(identityKey('Ana', 'Anić', '2018-01-01'))
    expect(identityKey('Đuro', 'Šušnjar', '2018-01-01')).toBe(
      identityKey('Duro', 'Susnjar', '2018-01-01'),
    )
    expect(identityKey('Ana', 'Ćorić', '2018-01-01')).toBe(identityKey('Ana', 'Coric', '2018-01-01'))
  })

  it('folds NFC vs NFD composition of the same letter', () => {
    expect(identityKey('Ana', 'Anic\u0301', '2018-01-01')).toBe(
      identityKey('Ana', 'Ani\u0107', '2018-01-01'),
    )
  })

  it('folds doubled inner spaces', () => {
    expect(identityKey('Ana  Marija', 'Anić', '2018-01-01')).toBe(
      identityKey('Ana Marija', 'Anić', '2018-01-01'),
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

  it('still tells genuinely different names apart', () => {
    expect(identityKey('Ana', 'Anić', '2018-01-01')).not.toBe(identityKey('Ana', 'Antić', '2018-01-01'))
  })
})

describe('legacyIdentityKey', () => {
  it('normalizes names and email the way the strict key does', () => {
    expect(legacyIdentityKey('  LUKA ', 'HORVAT', ' Mama@Example.COM ')).toBe(
      'luka|horvat|mama@example.com',
    )
    expect(legacyIdentityKey('Luka', 'Ćorić ', 'mama@example.com')).toBe(
      legacyIdentityKey('Luka', 'Coric', 'MAMA@example.com'),
    )
  })

  it('returns null when email or a name part is missing', () => {
    expect(legacyIdentityKey('Luka', 'Horvat', null)).toBeNull()
    expect(legacyIdentityKey('Luka', 'Horvat', '')).toBeNull()
    expect(legacyIdentityKey('', 'Horvat', 'mama@example.com')).toBeNull()
    expect(legacyIdentityKey('Luka', ' ', 'mama@example.com')).toBeNull()
  })

  it('never collides with a strict identity key', () => {
    // Same shape (a|b|c) but the third segment is an email, which always
    // contains '@' — a DOB string never does.
    expect(legacyIdentityKey('Luka', 'Horvat', 'mama@example.com')).not.toBe(
      identityKey('Luka', 'Horvat', 'mama@example.com'.replace('@', '-')),
    )
  })
})

describe('studentMatchKey', () => {
  it('keys a DOB-bearing row under the strict tier only', () => {
    expect(
      studentMatchKey({
        firstName: 'Luka',
        lastName: 'Horvat',
        dateOfBirth: '2015-04-01',
        parentEmail: 'mama@example.com',
      }),
    ).toBe('luka|horvat|2015-04-01')
  })

  it('keys a DOB-less row under the legacy tier, null without an email', () => {
    expect(
      studentMatchKey({
        firstName: 'Luka',
        lastName: 'Horvat',
        dateOfBirth: null,
        parentEmail: 'mama@example.com',
      }),
    ).toBe('luka|horvat|mama@example.com')
    expect(
      studentMatchKey({ firstName: 'Luka', lastName: 'Horvat', dateOfBirth: null, parentEmail: null }),
    ).toBeNull()
  })
})

describe('isIdentityMatch', () => {
  const stored = {
    firstName: 'Ana',
    lastName: 'Anić',
    dateOfBirth: '2018-01-01',
    parentEmail: 'mama@example.com',
  }

  it('matches "Anic " (trailing space, no diacritic) against a stored "Anić"', () => {
    expect(
      isIdentityMatch(stored, { firstName: 'Ana ', lastName: 'Anic ', dateOfBirth: '2018-01-01' }),
    ).toBe(true)
  })

  it('matches the reverse — "Anić" against a stored "Anic"', () => {
    expect(
      isIdentityMatch(
        { ...stored, lastName: 'Anic' },
        { firstName: 'Ana', lastName: 'Anić', dateOfBirth: '2018-01-01' },
      ),
    ).toBe(true)
  })

  it('refuses a different DOB even with the same parent email (strict row, sibling)', () => {
    expect(
      isIdentityMatch(stored, {
        firstName: 'Ana',
        lastName: 'Anić',
        dateOfBirth: '2016-01-01',
        parentEmail: 'mama@example.com',
      }),
    ).toBe(false)
  })

  it('matches a DOB-less row by name + email regardless of the identity DOB', () => {
    expect(
      isIdentityMatch(
        { ...stored, dateOfBirth: null },
        {
          firstName: 'ana',
          lastName: 'ANIC',
          dateOfBirth: '2016-01-01',
          parentEmail: ' MAMA@example.com ',
        },
      ),
    ).toBe(true)
  })
})

describe('candidateWheres', () => {
  it('narrows by DOB (strict) and by trimmed email against DOB-less rows (legacy)', () => {
    expect(
      candidateWheres({
        firstName: 'Luka',
        lastName: 'Horvat',
        dateOfBirth: '2015-04-01',
        parentEmail: ' Mama@Example.com ',
      }),
    ).toEqual([
      { role: 'STUDENT', dateOfBirth: '2015-04-01' },
      {
        role: 'STUDENT',
        dateOfBirth: null,
        parentEmail: { equals: 'Mama@Example.com', mode: 'insensitive' },
      },
    ])
  })

  it('never filters by name in SQL — the name is decided by the key in memory', () => {
    for (const where of candidateWheres({
      firstName: 'Luka',
      lastName: 'Horvat',
      dateOfBirth: '2015-04-01',
      parentEmail: 'mama@example.com',
    })) {
      expect(where).not.toHaveProperty('firstName')
      expect(where).not.toHaveProperty('lastName')
    }
  })

  it('is empty without a DOB and without an email (name alone never matches)', () => {
    expect(candidateWheres({ firstName: 'Luka', lastName: 'Horvat' })).toEqual([])
    expect(candidateWheres({ firstName: 'Luka', lastName: 'Horvat', dateOfBirth: null })).toEqual([])
  })

  it('skips the legacy clause for blank names so PARTY inquiries never match by email alone', () => {
    expect(
      candidateWheres({ firstName: '', lastName: '', parentEmail: 'mama@example.com' }),
    ).toEqual([])
    expect(
      candidateWheres({ firstName: 'Luka', lastName: ' ', parentEmail: 'mama@example.com' }),
    ).toEqual([])
  })
})
