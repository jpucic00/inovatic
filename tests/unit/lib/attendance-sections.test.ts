import { describe, expect, it } from 'vitest'
import {
  assignAdhocDateToSection,
  pickDefaultSessionDate,
} from '@/lib/attendance-sections'

const SECTIONS = [
  { firstSession: '2026-09-08', lastSession: '2026-10-20' }, // M1
  { firstSession: '2026-10-27', lastSession: '2026-12-15' }, // M2
  { firstSession: '2027-01-05', lastSession: '2027-02-16' }, // M3
  { firstSession: '2027-02-23', lastSession: '2027-04-06' }, // M4
]

describe('assignAdhocDateToSection', () => {
  it('returns the index of the module whose window contains the date', () => {
    expect(assignAdhocDateToSection('2026-09-15', SECTIONS)).toBe(0)
    expect(assignAdhocDateToSection('2026-11-10', SECTIONS)).toBe(1)
    expect(assignAdhocDateToSection('2027-01-19', SECTIONS)).toBe(2)
    expect(assignAdhocDateToSection('2027-03-09', SECTIONS)).toBe(3)
  })

  it('treats firstSession and lastSession as inclusive bounds', () => {
    expect(assignAdhocDateToSection('2026-09-08', SECTIONS)).toBe(0)
    expect(assignAdhocDateToSection('2026-10-20', SECTIONS)).toBe(0)
    expect(assignAdhocDateToSection('2026-10-27', SECTIONS)).toBe(1)
    expect(assignAdhocDateToSection('2026-12-15', SECTIONS)).toBe(1)
  })

  it('returns null for dates between two module windows', () => {
    // Gap between M1 lastSession (2026-10-20) and M2 firstSession (2026-10-27)
    expect(assignAdhocDateToSection('2026-10-23', SECTIONS)).toBeNull()
    // Gap between M3 and M4
    expect(assignAdhocDateToSection('2027-02-20', SECTIONS)).toBeNull()
  })

  it('returns null for dates before the first module', () => {
    expect(assignAdhocDateToSection('2026-09-01', SECTIONS)).toBeNull()
    expect(assignAdhocDateToSection('2020-01-01', SECTIONS)).toBeNull()
  })

  it('returns null for dates after the last module', () => {
    expect(assignAdhocDateToSection('2027-04-07', SECTIONS)).toBeNull()
    expect(assignAdhocDateToSection('2099-12-31', SECTIONS)).toBeNull()
  })

  it('returns null when sections array is empty', () => {
    expect(assignAdhocDateToSection('2026-10-15', [])).toBeNull()
  })

  it('skips placeholder sections with null bounds', () => {
    const sectionsWithPlaceholder = [
      { firstSession: null, lastSession: null }, // M1 placeholder
      { firstSession: '2026-10-27', lastSession: '2026-12-15' }, // M2 real
      { firstSession: null, lastSession: null }, // M3 placeholder
      { firstSession: '2027-02-23', lastSession: '2027-04-06' }, // M4 real
    ]
    expect(assignAdhocDateToSection('2026-11-10', sectionsWithPlaceholder)).toBe(1)
    expect(assignAdhocDateToSection('2027-03-09', sectionsWithPlaceholder)).toBe(3)
    expect(assignAdhocDateToSection('2026-09-15', sectionsWithPlaceholder)).toBeNull()
  })

  it('returns the first matching section when windows overlap', () => {
    const overlapping = [
      { firstSession: '2026-09-01', lastSession: '2026-10-31' },
      { firstSession: '2026-10-15', lastSession: '2026-11-30' },
    ]
    expect(assignAdhocDateToSection('2026-10-20', overlapping)).toBe(0)
  })
})

describe('pickDefaultSessionDate', () => {
  // Probni sat on Wed 23.9., module 1 from Wed 30.9.
  const DATES = ['2026-09-30', '2026-10-07', '2026-09-23', '2026-10-14']

  it('opens the probni sat during the probni tjedan, not module 1', () => {
    expect(pickDefaultSessionDate(DATES, '2026-09-21')).toBe('2026-09-23')
    expect(pickDefaultSessionDate(DATES, '2026-09-24')).toBe('2026-09-23')
  })

  it("opens today's session on a session day", () => {
    expect(pickDefaultSessionDate(DATES, '2026-10-07')).toBe('2026-10-07')
  })

  it('opens the most recent held session between sessions', () => {
    expect(pickDefaultSessionDate(DATES, '2026-10-09')).toBe('2026-10-07')
    expect(pickDefaultSessionDate(DATES, '2026-12-01')).toBe('2026-10-14')
  })

  it('opens the first upcoming session before anything was held', () => {
    expect(pickDefaultSessionDate(DATES, '2026-09-01')).toBe('2026-09-23')
  })

  it('falls back to today when the group has no sessions', () => {
    expect(pickDefaultSessionDate([], '2026-09-24')).toBe('2026-09-24')
  })
})
