import { beforeEach, describe, expect, it } from 'vitest'
import {
  filterMemoryKey,
  readFilterMemory,
  withoutFilterParam,
  writeFilterMemory,
} from '@/lib/admin-filter-memory'

const JOZO = 'user-jozo'
const SLAVICA = 'user-slavica'
const STUDENTS = '/admin/ucenici'

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('filterMemoryKey', () => {
  it('separates admins and lists', () => {
    expect(filterMemoryKey(JOZO, STUDENTS)).not.toBe(filterMemoryKey(SLAVICA, STUDENTS))
    expect(filterMemoryKey(JOZO, STUDENTS)).not.toBe(filterMemoryKey(JOZO, '/admin/grupe'))
  })
})

describe('readFilterMemory / writeFilterMemory', () => {
  it('returns the last recorded query for that admin and list', () => {
    writeFilterMemory(JOZO, STUDENTS, 'courseId=c1&page=3')
    expect(readFilterMemory(JOZO, STUDENTS)).toBe('courseId=c1&page=3')
  })

  it('never hands one admin another admin’s filter', () => {
    writeFilterMemory(JOZO, STUDENTS, 'groupId=g-split')
    // Šibenik's admin signing in on the same tab: a Split group id would filter
    // her city-scoped list down to nothing, which reads as missing data.
    expect(readFilterMemory(SLAVICA, STUDENTS)).toBe('')
  })

  it('keeps lists independent', () => {
    writeFilterMemory(JOZO, STUDENTS, 'payment=PENDING')
    expect(readFilterMemory(JOZO, '/admin/upiti')).toBe('')
  })

  it('records a deliberate clear, so it is not restored later', () => {
    writeFilterMemory(JOZO, STUDENTS, 'search=ana')
    writeFilterMemory(JOZO, STUDENTS, '')
    expect(readFilterMemory(JOZO, STUDENTS)).toBe('')
  })

  it('reads and writes nothing without an admin id', () => {
    writeFilterMemory('', STUDENTS, 'search=ana')
    expect(window.sessionStorage.length).toBe(0)
    expect(readFilterMemory('', STUDENTS)).toBe('')
  })
})

describe('withoutFilterParam', () => {
  it('removes just that filter', () => {
    expect(withoutFilterParam('courseId=c1&groupId=g1', 'courseId')).toBe('groupId=g1')
  })

  it('drops the page along with it', () => {
    // Page 3 of a wider list is usually past the end of the narrower one, and
    // an empty table reads as "removing that filter broke something".
    expect(withoutFilterParam('courseId=c1&groupId=g1&page=3', 'groupId')).toBe('courseId=c1')
  })

  it('returns an empty query when the last filter comes off', () => {
    expect(withoutFilterParam('search=ana&page=2', 'search')).toBe('')
  })

  it('leaves an absent key alone', () => {
    expect(withoutFilterParam('search=ana', 'payment')).toBe('search=ana')
  })
})
