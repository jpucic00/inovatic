import { describe, expect, it } from 'vitest'
import { inquirySortValue, waitlistSortValue } from '@/lib/admin-list-sorts'
import { sortRows } from '@/lib/list-sort'

const inquiry = (
  over: Partial<Parameters<typeof inquirySortValue>[1]>,
): Parameters<typeof inquirySortValue>[1] => ({
  type: 'COURSE',
  parentName: 'Roditelj',
  childFirstName: null,
  childLastName: null,
  childGrade: null,
  status: 'NEW',
  createdAt: new Date('2026-10-01'),
  ...over,
})

describe('inquirySortValue', () => {
  it('puts a proslava after every child name, Ž included', () => {
    const rows = [
      inquiry({ type: 'PARTY' }),
      inquiry({ childFirstName: 'Željko', childLastName: 'Ivić' }),
      inquiry({ childFirstName: 'Ana', childLastName: 'Anić' }),
    ]
    const sorted = sortRows(rows, { key: 'childName', dir: 'asc' }, inquirySortValue)
    expect(sorted.map((r) => r.type === 'PARTY' ? 'PARTY' : r.childFirstName)).toEqual([
      'Ana',
      'Željko',
      'PARTY',
    ])
  })

  it('sorts status by the Croatian label, not the enum code', () => {
    const rows = ['ACCOUNT_CREATED', 'NEW', 'DECLINED'].map((status) => inquiry({ status }))
    const sorted = sortRows(rows, { key: 'status', dir: 'asc' }, inquirySortValue)
    // Nova < Odbijena < Račun stvoren
    expect(sorted.map((r) => r.status)).toEqual(['NEW', 'DECLINED', 'ACCOUNT_CREATED'])
  })
})

describe('waitlistSortValue', () => {
  it('sorts status by the Croatian label', () => {
    const rows = ['ACCOUNT_CREATED', 'DECLINED', 'NEW'].map((status) => ({
      parentName: 'R',
      childFirstName: null,
      childLastName: null,
      status,
      waitlistedAt: null,
    }))
    const sorted = sortRows(rows, { key: 'status', dir: 'asc' }, waitlistSortValue)
    expect(sorted.map((r) => r.status)).toEqual(['NEW', 'DECLINED', 'ACCOUNT_CREATED'])
  })
})
