import { describe, expect, it } from 'vitest'
import {
  buildCredentialsRecipients,
  type CredentialsCandidate,
} from '@/lib/bulk-email-recipients'
import {
  assertPasswordLinkBelongsTo,
  type PasswordLinkOwnership,
} from '@/lib/credentials-email-recipients'

function candidate(over: Partial<CredentialsCandidate> & { studentId: string }): CredentialsCandidate {
  return {
    firstName: over.studentId,
    lastName: 'Anić',
    groupLabel: 'SLR 2',
    account: { id: 'acc-1', email: 'Ivana@Example.com', passwordSet: false, alreadySent: false },
    ...over,
  }
}

describe('buildCredentialsRecipients — one row per parent LOGIN', () => {
  it('lists every selected child of one login in a single row, keyed by its address', () => {
    const { recipients, skipped } = buildCredentialsRecipients([
      candidate({ studentId: 'Marko' }),
      candidate({ studentId: 'Ana' }),
    ])
    expect(skipped).toEqual([])
    expect(recipients).toHaveLength(1)
    expect(recipients[0]).toMatchObject({
      parentEmail: 'ivana@example.com',
      rowKey: 'ivana@example.com',
    })
    expect(recipients[0].children.map((c) => c.name)).toEqual(['Ana Anić', 'Marko Anić'])
    expect(recipients[0].studentIds.sort()).toEqual(['Ana', 'Marko'])
  })

  it('keeps two logins apart even when their addresses look alike', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ studentId: 'A', account: { id: 'acc-1', email: 'a@x.hr', passwordSet: false, alreadySent: false } }),
      candidate({ studentId: 'B', account: { id: 'acc-2', email: 'b@x.hr', passwordSet: false, alreadySent: false } }),
    ])
    expect(recipients).toHaveLength(2)
  })

  it('lists a child in two selected groups once', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ studentId: 'Marko' }),
      candidate({ studentId: 'Marko' }),
    ])
    expect(recipients[0].studentIds).toEqual(['Marko'])
  })

  it('skips — by name — a child with no parent login', () => {
    const { recipients, skipped } = buildCredentialsRecipients([
      candidate({ studentId: 'Luka', account: null }),
    ])
    expect(recipients).toEqual([])
    expect(skipped).toEqual([{ studentId: 'Luka', studentName: 'Luka Anić', reason: 'NO_PARENT_ACCOUNT' }])
  })

  it('carries the login state through to the composer badges, but still sends', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ studentId: 'Ana', account: { id: 'acc-1', email: 'a@x.hr', passwordSet: true, alreadySent: true } }),
    ])
    expect(recipients[0].children[0]).toMatchObject({ passwordSet: true, alreadySent: true })
  })
})

function child(over: Partial<PasswordLinkOwnership> & { id: string }): PasswordLinkOwnership {
  return {
    city: 'SPLIT',
    deletedAt: null,
    parentAccount: { id: 'acc-1', email: 'ivana@example.com', role: 'PARENT', deletedAt: null },
    ...over,
  }
}

const expected = { parentEmail: 'ivana@example.com', city: 'SPLIT' as const, studentIds: ['a', 'b'] }

describe('assertPasswordLinkBelongsTo — fails closed', () => {
  it('passes children that still share the one login the row names, and returns it', () => {
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' }), child({ id: 'b' })])).toEqual({
      ok: true,
      accountId: 'acc-1',
    })
  })

  it('refuses when a child moved to the other parent since the cohort was written', () => {
    const moved = child({
      id: 'b',
      parentAccount: { id: 'acc-2', email: 'otac@example.com', role: 'PARENT', deletedAt: null },
    })
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' }), moved]).ok).toBe(false)
  })

  it('refuses when the children now sit on two different logins', () => {
    const other = child({
      id: 'b',
      parentAccount: { id: 'acc-2', email: 'ivana@example.com', role: 'PARENT', deletedAt: null },
    })
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' }), other]).ok).toBe(false)
  })

  it('refuses a deleted child, a child in the other city, and a child with no login', () => {
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' }), child({ id: 'b', deletedAt: new Date() })]).ok).toBe(false)
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' }), child({ id: 'b', city: 'SIBENIK' })]).ok).toBe(false)
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' }), child({ id: 'b', parentAccount: null })]).ok).toBe(false)
  })

  it('refuses a login that can never take a link, or a deleted one', () => {
    const classroom = { id: 'acc-1', email: 'ivana@example.com', role: 'CLASSROOM' as const, deletedAt: null }
    const deleted = { id: 'acc-1', email: 'ivana@example.com', role: 'PARENT' as const, deletedAt: new Date() }
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a', parentAccount: classroom }), child({ id: 'b', parentAccount: classroom })]).ok).toBe(false)
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a', parentAccount: deleted }), child({ id: 'b', parentAccount: deleted })]).ok).toBe(false)
  })

  it('refuses when the loaded set is not exactly the row\'s set', () => {
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a' })]).ok).toBe(false)
    expect(assertPasswordLinkBelongsTo({ ...expected, studentIds: [] }, []).ok).toBe(false)
  })

  it('lets a staff login that is also a parent receive the link', () => {
    const staff = { id: 'acc-1', email: 'ivana@example.com', role: 'TEACHER' as const, deletedAt: null }
    expect(assertPasswordLinkBelongsTo(expected, [child({ id: 'a', parentAccount: staff }), child({ id: 'b', parentAccount: staff })]).ok).toBe(true)
  })
})
