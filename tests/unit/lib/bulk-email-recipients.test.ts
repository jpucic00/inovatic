import { describe, expect, it } from 'vitest'
import {
  buildEmailRecipients,
  normalizeParentEmail,
  type EmailRecipientStudent,
} from '@/lib/bulk-email-recipients'

function student(overrides: Partial<EmailRecipientStudent> & { id: string }): EmailRecipientStudent {
  return {
    firstName: 'Ime',
    lastName: 'Prezime',
    parentEmail: null,
    ...overrides,
  }
}

describe('normalizeParentEmail', () => {
  it('passes a plain valid address through lowercased and trimmed', () => {
    expect(normalizeParentEmail('  Ana@Example.COM ')).toBe('ana@example.com')
  })

  it('extracts the addr-spec from the legacy "Name <a@b>" import format', () => {
    expect(normalizeParentEmail('Ana Anić <ANA@Example.com>')).toBe('ana@example.com')
  })

  it('returns null for null input', () => {
    expect(normalizeParentEmail(null)).toBeNull()
  })

  it('returns null for garbage values', () => {
    expect(normalizeParentEmail('nema')).toBeNull()
    expect(normalizeParentEmail('a@b')).toBeNull()
    expect(normalizeParentEmail('   ')).toBeNull()
    expect(normalizeParentEmail('Ana Anić <>')).toBeNull()
  })
})

// The regex was rewritten for linear time (d9a1c42). A regression here does
// not throw — it silently turns a family into a SKIPPED row on every campaign.
describe('normalizeParentEmail — accepted address shapes', () => {
  it.each([
    'x@os-split.skole.hr',
    'a+tag@gmail.com',
    'ana.maria.anic@t-com.hr',
    'a_b@c.co.uk',
  ])('keeps %s', (addr) => {
    expect(normalizeParentEmail(addr)).toBe(addr)
  })

  it.each(['a@b..hr', 'a@.b.hr', 'a@b.hr.', 'a b@c.hr', 'a@b@c.hr', '@b.hr', 'a@'])(
    'refuses %s',
    (addr) => {
      expect(normalizeParentEmail(addr)).toBeNull()
    },
  )

  it('stays linear on adversarial input', () => {
    const evil = 'a@' + 'b.'.repeat(25_000) + '@'
    const started = performance.now()
    expect(normalizeParentEmail(evil)).toBeNull()
    expect(performance.now() - started).toBeLessThan(100)
  })
})

describe('buildEmailRecipients', () => {
  it('merges siblings sharing one parent email into a single recipient', () => {
    const { recipients, skipped } = buildEmailRecipients([
      student({ id: 's1', firstName: 'Marko', lastName: 'Anić', parentEmail: 'mama@test.hr' }),
      student({ id: 's2', firstName: 'Luka', lastName: 'Anić', parentEmail: 'mama@test.hr' }),
    ])
    expect(skipped).toEqual([])
    expect(recipients).toHaveLength(1)
    expect(recipients[0].parentEmail).toBe('mama@test.hr')
    expect(recipients[0].children.map((c) => c.name)).toEqual(['Marko Anić', 'Luka Anić'])
  })

  it('threads each child’s recommendation label through to the merged recipient', () => {
    const { recipients } = buildEmailRecipients([
      student({ id: 's1', firstName: 'Marko', parentEmail: 'mama@test.hr', recommendation: 'Svijet LEGO Robotike 3' }),
      student({ id: 's2', firstName: 'Luka', parentEmail: 'mama@test.hr' }),
    ])
    expect(recipients[0].children).toEqual([
      { name: 'Marko Prezime', recommendation: 'Svijet LEGO Robotike 3' },
      { name: 'Luka Prezime', recommendation: null },
    ])
  })

  it('dedupes case-insensitively and across the dirty legacy format', () => {
    const { recipients } = buildEmailRecipients([
      student({ id: 's1', parentEmail: 'MAMA@test.hr' }),
      student({ id: 's2', parentEmail: 'Ana <mama@test.hr>' }),
    ])
    expect(recipients).toHaveLength(1)
    expect(recipients[0].parentEmail).toBe('mama@test.hr')
  })

  it('collapses duplicate student rows by id', () => {
    const { recipients } = buildEmailRecipients([
      student({ id: 's1', firstName: 'Marko', parentEmail: 'mama@test.hr' }),
      student({ id: 's1', firstName: 'Marko', parentEmail: 'mama@test.hr' }),
    ])
    expect(recipients).toHaveLength(1)
    expect(recipients[0].children).toHaveLength(1)
  })

  it('splits off missing and invalid emails with distinct reasons', () => {
    const { recipients, skipped } = buildEmailRecipients([
      student({ id: 's1', firstName: 'Bez', lastName: 'Adrese', parentEmail: null }),
      student({ id: 's2', firstName: 'Kriva', lastName: 'Adresa', parentEmail: 'nema' }),
      student({ id: 's3', firstName: 'Prazna', lastName: 'Adresa', parentEmail: '   ' }),
      student({ id: 's4', parentEmail: 'ok@test.hr' }),
    ])
    expect(recipients).toHaveLength(1)
    expect(skipped).toEqual([
      { studentId: 's1', studentName: 'Bez Adrese', reason: 'MISSING_EMAIL' },
      { studentId: 's2', studentName: 'Kriva Adresa', reason: 'INVALID_EMAIL' },
      { studentId: 's3', studentName: 'Prazna Adresa', reason: 'MISSING_EMAIL' },
    ])
  })

  it('sorts recipients by email for stable output', () => {
    const { recipients } = buildEmailRecipients([
      student({ id: 's1', parentEmail: 'zzz@test.hr' }),
      student({ id: 's2', parentEmail: 'aaa@test.hr' }),
    ])
    expect(recipients.map((r) => r.parentEmail)).toEqual(['aaa@test.hr', 'zzz@test.hr'])
  })
})
