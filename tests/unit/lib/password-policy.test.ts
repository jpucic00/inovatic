import { describe, expect, it } from 'vitest'
import { passwordProblem } from '@/lib/password-policy'

const ok = (pw: string, email: string | null = 'ivana.anic@example.com') =>
  passwordProblem(pw, pw, email)

describe('passwordProblem', () => {
  it('accepts a long plain phrase — no composition rules', () => {
    expect(ok('konj jede zeleni kupus')).toBeNull()
  })

  it('refuses anything under 8 characters', () => {
    expect(ok('kratka1')).toBe('TOO_SHORT')
  })

  it('does not count leading or trailing whitespace toward the minimum', () => {
    expect(ok(' '.repeat(8))).toBe('TOO_SHORT')
    expect(ok(`${' '.repeat(7)}a`)).toBe('TOO_SHORT')
    expect(ok('\t kratka1 \n')).toBe('TOO_SHORT')
    expect(ok('  zelenkup  ')).toBeNull()
  })

  it('counts an inner space like any other character', () => {
    expect(ok('konj kup')).toBeNull()
  })

  it('refuses beyond 72 BYTES, which bcrypt would silently cut', () => {
    expect(ok('a'.repeat(72))).toBeNull()
    expect(ok('a'.repeat(73))).toBe('TOO_LONG')
    // 37 × "č" is 74 bytes though only 37 characters.
    expect(ok('č'.repeat(37))).toBe('TOO_LONG')
  })

  it('refuses the obvious first guesses, whatever the case', () => {
    expect(ok('12345678')).toBe('COMMON')
    expect(ok('Lozinka123')).toBe('COMMON')
    expect(ok('INOVATIC123')).toBe('COMMON')
  })

  it('refuses a password built on the account\'s own address', () => {
    expect(ok('ivana.anic2026')).toBe('CONTAINS_IDENTITY')
    // Too short a local part to mean anything is ignored.
    expect(passwordProblem('ana-je-super', 'ana-je-super', 'ana@x.hr')).toBeNull()
  })

  it('refuses a mismatched confirmation last, after the password itself passes', () => {
    expect(passwordProblem('konj jede kupus', 'konj jede kupuss', null)).toBe('MISMATCH')
  })
})
