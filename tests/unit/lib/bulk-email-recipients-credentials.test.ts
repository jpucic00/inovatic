import { describe, expect, it } from 'vitest'
import {
  buildCredentialsRecipients,
  type CredentialsCandidate,
} from '@/lib/bulk-email-recipients'

function candidate(overrides: Partial<CredentialsCandidate> = {}): CredentialsCandidate {
  return {
    studentId: 'student-1',
    firstName: 'Ana',
    lastName: 'Anić',
    parentEmail: 'roditelj@example.com',
    groupLabel: 'SLR 2 – utorkom · Svijet LEGO robotike 2',
    needsPassword: false,
    alreadySent: false,
    ...overrides,
  }
}

describe('buildCredentialsRecipients', () => {
  it('builds one row per child, keyed on the student', () => {
    const { recipients } = buildCredentialsRecipients([candidate()])

    expect(recipients).toHaveLength(1)
    expect(recipients[0].rowKey).toBe('student-1')
    expect(recipients[0].studentIds).toEqual(['student-1'])
    expect(recipients[0].assessmentIds).toEqual([])
    expect(recipients[0].children[0].name).toBe('Ana Anić')
  })

  /**
   * The single most important property of this kind. Two siblings have two
   * different usernames and passwords, so merging them would put one child's
   * login in a mail about the other.
   */
  it('does NOT merge two children who share a parent address', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ studentId: 's1', firstName: 'Ana' }),
      candidate({ studentId: 's2', firstName: 'Marko' }),
    ])

    expect(recipients).toHaveLength(2)
    expect(recipients.map((r) => r.rowKey).sort()).toEqual(['s1', 's2'])
    // Each row carries exactly its own child.
    for (const r of recipients) {
      expect(r.children).toHaveLength(1)
      expect(r.studentIds).toHaveLength(1)
    }
  })

  /**
   * The one place this differs from the evaluation builder: a password is an
   * ACCOUNT fact, so a child in two selected groups is one mail listing both —
   * not two mails, which would send the same secret twice.
   */
  it('collapses a child appearing twice into a single row', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ studentId: 's1', groupLabel: 'Grupa A' }),
      candidate({ studentId: 's1', groupLabel: 'Grupa B' }),
    ])

    expect(recipients).toHaveLength(1)
    expect(recipients[0].children[0].groupLabel).toBe('Grupa A')
  })

  it('skips a child whose parent has no address, by name', () => {
    const { recipients, skipped } = buildCredentialsRecipients([
      candidate({ studentId: 's1', parentEmail: null }),
    ])

    expect(recipients).toHaveLength(0)
    expect(skipped).toEqual([
      { studentId: 's1', studentName: 'Ana Anić', reason: 'MISSING_EMAIL' },
    ])
  })

  it('distinguishes a garbage address from a missing one', () => {
    const { skipped } = buildCredentialsRecipients([
      candidate({ studentId: 's1', parentEmail: 'not-an-email' }),
    ])

    expect(skipped[0].reason).toBe('INVALID_EMAIL')
  })

  it('carries the needsPassword and alreadySent flags through to the row', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ needsPassword: true, alreadySent: true }),
    ])

    expect(recipients[0].children[0].needsPassword).toBe(true)
    expect(recipients[0].children[0].alreadySent).toBe(true)
  })

  it('sorts by child name so the list reads as a roster', () => {
    const { recipients } = buildCredentialsRecipients([
      candidate({ studentId: 's2', firstName: 'Zoran' }),
      candidate({ studentId: 's1', firstName: 'Ana' }),
    ])

    expect(recipients.map((r) => r.children[0].name)).toEqual(['Ana Anić', 'Zoran Anić'])
  })
})
