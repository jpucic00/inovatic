import { describe, expect, it } from 'vitest'
import {
  assertCredentialsBelongTo,
  type CredentialsOwnership,
} from '@/lib/credentials-email-recipients'

const CITY = 'SPLIT' as const
const PARENT = 'roditelj@example.com'

function owner(overrides: Partial<CredentialsOwnership> = {}): CredentialsOwnership {
  return {
    id: 'student-1',
    parentEmail: PARENT,
    city: CITY,
    username: 'ana_anic',
    plainPassword: 'abc123',
    deletedAt: null,
    ...overrides,
  }
}

const expected = { parentEmail: PARENT, city: CITY, studentIds: ['student-1'] }

describe('assertCredentialsBelongTo', () => {
  it('passes when the account still lists exactly this address', () => {
    expect(assertCredentialsBelongTo(expected, [owner()])).toEqual({ ok: true })
  })

  it("normalizes the stored address before comparing (case and surrounding space)", () => {
    const verdict = assertCredentialsBelongTo(expected, [
      owner({ parentEmail: '  Roditelj@Example.COM ' }),
    ])
    expect(verdict.ok).toBe(true)
  })

  // Each of the following is a "do not send" — the whole point of the guard.

  it('refuses when the parent address changed after the cohort was written', () => {
    const verdict = assertCredentialsBelongTo(expected, [
      owner({ parentEmail: 'netko.drugi@example.com' }),
    ])
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/adresa roditelja se promijenila/i)
  })

  it('refuses when the parent address was cleared', () => {
    expect(assertCredentialsBelongTo(expected, [owner({ parentEmail: null })]).ok).toBe(false)
  })

  it('refuses when the account was deleted', () => {
    const verdict = assertCredentialsBelongTo(expected, [owner({ deletedAt: new Date() })])
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/izbrisan/i)
  })

  it('refuses an account from the other city', () => {
    const verdict = assertCredentialsBelongTo(expected, [owner({ city: 'SIBENIK' })])
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/drugom gradu/i)
  })

  it('refuses when the account has no usable password', () => {
    const verdict = assertCredentialsBelongTo(expected, [owner({ plainPassword: null })])
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/lozink/i)
  })

  it('refuses when the account has no username', () => {
    expect(assertCredentialsBelongTo(expected, [owner({ username: null })]).ok).toBe(false)
  })

  it('refuses when the account named by the row no longer exists', () => {
    const verdict = assertCredentialsBelongTo(expected, [])
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/izbrisan ili izmijenjen/i)
  })

  it('refuses when the loaded row is a different account than the row named', () => {
    const verdict = assertCredentialsBelongTo(expected, [owner({ id: 'student-2' })])
    expect(verdict.ok).toBe(false)
  })

  it('refuses a row naming no account at all', () => {
    expect(
      assertCredentialsBelongTo({ ...expected, studentIds: [] }, []).ok,
    ).toBe(false)
  })

  // A credentials row is ONE account by construction. A row naming two would be
  // the merged-secrets case this kind exists to prevent, so it is refused rather
  // than sent.
  it('refuses a row naming two accounts', () => {
    const verdict = assertCredentialsBelongTo(
      { ...expected, studentIds: ['student-1', 'student-2'] },
      [owner(), owner({ id: 'student-2' })],
    )
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/nema računa/i)
  })
})
