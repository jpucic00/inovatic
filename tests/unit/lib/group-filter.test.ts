import { describe, expect, it } from 'vitest'
import {
  isSingleProgramFilter,
  matchesGroupFilter,
  resolveGroupFilter,
  type GroupFilterKey,
} from '@/lib/group-filter'
import type { ProgramKind } from '@prisma/client'

const g = (kind: ProgramKind, level: string | null) => ({ course: { kind, level } })

const uvod = g('STANDARD', 'UVOD')
const slr2 = g('STANDARD', 'SLR_2')
// Neither of these carries a CourseLevel — they are identified by kind alone.
const competition = g('COMPETITION', null)
const radionica = g('RADIONICA', null)

describe('matchesGroupFilter', () => {
  it('"all" keeps every kind', () => {
    for (const group of [uvod, slr2, competition, radionica]) {
      expect(matchesGroupFilter(group, 'all')).toBe(true)
    }
  })

  it('"standard" is the whole SLR ladder, Uvod included', () => {
    expect(matchesGroupFilter(uvod, 'standard')).toBe(true)
    expect(matchesGroupFilter(slr2, 'standard')).toBe(true)
    expect(matchesGroupFilter(competition, 'standard')).toBe(false)
    expect(matchesGroupFilter(radionica, 'standard')).toBe(false)
  })

  it('picks the level-less kinds by kind', () => {
    expect(matchesGroupFilter(competition, 'competition')).toBe(true)
    expect(matchesGroupFilter(radionica, 'radionice')).toBe(true)
    expect(matchesGroupFilter(competition, 'radionice')).toBe(false)
    expect(matchesGroupFilter(slr2, 'competition')).toBe(false)
  })

  it('narrows to a single level', () => {
    expect(matchesGroupFilter(slr2, 'SLR_2')).toBe(true)
    expect(matchesGroupFilter(slr2, 'SLR_3')).toBe(false)
    expect(matchesGroupFilter(uvod, 'UVOD')).toBe(true)
  })

  // Regression guard: a level key must stay pinned to STANDARD, so a
  // hypothetical non-standard course carrying a level can never leak in.
  it('a level key never matches another kind', () => {
    expect(matchesGroupFilter(g('RADIONICA', 'SLR_2'), 'SLR_2')).toBe(false)
  })
})

describe('resolveGroupFilter', () => {
  const courses = [
    { id: 'c-uvod', level: 'UVOD', kind: 'STANDARD' as const },
    { id: 'c-slr2', level: 'SLR_2', kind: 'STANDARD' as const },
    { id: 'c-comp', level: null, kind: 'COMPETITION' as const },
    { id: 'c-rad', level: null, kind: 'RADIONICA' as const },
  ]

  it.each<[string | undefined, GroupFilterKey]>([
    [undefined, 'all'],
    ['__radionice__', 'radionice'],
    ['c-uvod', 'UVOD'],
    ['c-slr2', 'SLR_2'],
    ['c-comp', 'competition'],
    ['c-rad', 'radionice'],
    // A link to a program that is no longer in this year/city must not 404 the
    // view — it falls back to showing everything.
    ['c-gone', 'all'],
  ])('?tab=%s resolves to %s', (tab, expected) => {
    expect(resolveGroupFilter(tab, courses)).toBe(expected)
  })

  it('falls back when a standard course has no usable level', () => {
    expect(resolveGroupFilter('c-x', [{ id: 'c-x', level: null, kind: 'STANDARD' }])).toBe('all')
  })
})

describe('isSingleProgramFilter', () => {
  it('is true only where every row would repeat the same program name', () => {
    expect(isSingleProgramFilter('SLR_1')).toBe(true)
    expect(isSingleProgramFilter('UVOD')).toBe(true)
    expect(isSingleProgramFilter('competition')).toBe(true)
    // Radionice are many different courses, so the column still earns its place
    expect(isSingleProgramFilter('radionice')).toBe(false)
    expect(isSingleProgramFilter('standard')).toBe(false)
    expect(isSingleProgramFilter('all')).toBe(false)
  })
})
