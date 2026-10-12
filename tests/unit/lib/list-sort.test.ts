import { describe, expect, it } from 'vitest'
import {
  compareSortValues,
  nextListSort,
  parseListSort,
  sortQueryFor,
  sortRows,
} from '@/lib/list-sort'

const KEYS = ['name', 'createdAt'] as const

describe('parseListSort', () => {
  it('accepts a known key and defaults the direction to ascending', () => {
    expect(parseListSort(KEYS, 'name', undefined)).toEqual({ key: 'name', dir: 'asc' })
    expect(parseListSort(KEYS, 'name', 'desc')).toEqual({ key: 'name', dir: 'desc' })
  })

  it('ignores an unknown key, so a hand-edited URL falls back to the default order', () => {
    expect(parseListSort(KEYS, 'password', 'asc')).toBeUndefined()
    expect(parseListSort(KEYS, undefined, 'desc')).toBeUndefined()
  })
})

describe('compareSortValues', () => {
  it('orders names by the Croatian alphabet', () => {
    expect(['Čedo', 'Cvita', 'Ana', 'Dino'].sort(compareSortValues)).toEqual([
      'Ana',
      'Cvita',
      'Čedo',
      'Dino',
    ])
  })

  it('compares numbers numerically', () => {
    expect([10, 9, 100].sort(compareSortValues)).toEqual([9, 10, 100])
  })
})

describe('sortRows', () => {
  it('keeps the incoming order for ties and never mutates its input', () => {
    const rows = [
      { id: 'a', v: 1 },
      { id: 'b', v: 0 },
      { id: 'c', v: 1 },
    ]
    const sorted = sortRows(rows, { key: 'v', dir: 'desc' }, (_, r) => r.v)
    expect(sorted.map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('header click cycle', () => {
  it('goes off → asc → desc → off, and restarts on another column', () => {
    expect(nextListSort(undefined, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextListSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(nextListSort({ key: 'name', dir: 'desc' }, 'name')).toBeUndefined()
    expect(nextListSort({ key: 'name', dir: 'desc' }, 'createdAt')).toEqual({
      key: 'createdAt',
      dir: 'asc',
    })
  })

  it('keeps every filter, drops the page, and clears both params when switched off', () => {
    const params = new URLSearchParams('search=ana&groupId=g1&page=3')
    expect(sortQueryFor(params, undefined, 'name')).toBe('search=ana&groupId=g1&sort=name&dir=asc')

    const sorted = new URLSearchParams('search=ana&sort=name&dir=desc&page=2')
    expect(sortQueryFor(sorted, { key: 'name', dir: 'desc' }, 'name')).toBe('search=ana')
  })
})
