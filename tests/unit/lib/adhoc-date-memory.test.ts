import { beforeEach, describe, expect, it } from 'vitest'
import { readAdhocDates, writeAdhocDates } from '@/lib/adhoc-date-memory'

const G1 = 'group-1'
const G2 = 'group-2'
const NONE: ReadonlySet<string> = new Set()

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('readAdhocDates / writeAdhocDates', () => {
  it('round-trips draft dates for a group', () => {
    writeAdhocDates(G1, ['2026-08-20', '2026-08-27'])
    expect(readAdhocDates(G1, NONE)).toEqual(['2026-08-20', '2026-08-27'])
  })

  it('keeps groups independent', () => {
    writeAdhocDates(G1, ['2026-08-20'])
    expect(readAdhocDates(G2, NONE)).toEqual([])
    expect(readAdhocDates(G1, NONE)).toEqual(['2026-08-20'])
  })

  it('prunes dates the server already knows, and the prune sticks', () => {
    writeAdhocDates(G1, ['2026-08-20', '2026-08-27'])
    // 20.08. got real attendance rows saved — the server lists it itself now.
    expect(readAdhocDates(G1, new Set(['2026-08-20']))).toEqual(['2026-08-27'])
    // The shrunken list was written back: a later read no longer needs the hint.
    expect(readAdhocDates(G1, NONE)).toEqual(['2026-08-27'])
  })

  it('clears the entry when every date is pruned', () => {
    writeAdhocDates(G1, ['2026-08-20'])
    expect(readAdhocDates(G1, new Set(['2026-08-20']))).toEqual([])
    expect(window.sessionStorage.length).toBe(0)
  })

  it('clears the entry when writing an empty list', () => {
    writeAdhocDates(G1, ['2026-08-20'])
    writeAdhocDates(G1, [])
    expect(window.sessionStorage.length).toBe(0)
  })

  it('treats garbage in storage as empty instead of throwing', () => {
    window.sessionStorage.setItem(`inovatic:adhoc-dates:${G1}`, 'not-json{')
    expect(readAdhocDates(G1, NONE)).toEqual([])
  })

  it('treats a non-array JSON value as empty', () => {
    window.sessionStorage.setItem(
      `inovatic:adhoc-dates:${G1}`,
      JSON.stringify({ date: '2026-08-20' }),
    )
    expect(readAdhocDates(G1, NONE)).toEqual([])
  })

  it('drops non-date entries and duplicates', () => {
    window.sessionStorage.setItem(
      `inovatic:adhoc-dates:${G1}`,
      JSON.stringify(['2026-08-20', '2026-08-20', 42, 'yesterday', null]),
    )
    expect(readAdhocDates(G1, NONE)).toEqual(['2026-08-20'])
  })
})
