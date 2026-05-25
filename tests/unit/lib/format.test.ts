import { describe, expect, it } from 'vitest'
import {
  DAYS_HR,
  formatChildName,
  formatDate,
  formatDateKey,
  formatGroupSchedule,
} from '@/lib/format'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12))

describe('formatDate — short (default)', () => {
  it('produces dd.MM.yyyy. (Croatian locale with trailing dot)', () => {
    expect(formatDate(utc(2026, 5, 15))).toBe('15. 05. 2026.')
  })

  it('zero-pads day and month', () => {
    expect(formatDate(utc(2026, 1, 5))).toBe('05. 01. 2026.')
  })

  it('returns empty string for null date', () => {
    expect(formatDate(null)).toBe('')
  })
})

describe('formatDate — long', () => {
  it('uses Croatian long month name', () => {
    const result = formatDate(utc(2026, 5, 15), 'long')
    // hr-HR long: "15. svibnja 2026." or similar — assert pattern not exact str
    expect(result).toMatch(/^15\.\s.*\s2026\.$/)
    expect(result.toLowerCase()).toContain('svib')
  })

  it('returns empty string for null date', () => {
    expect(formatDate(null, 'long')).toBe('')
  })
})

describe('formatChildName', () => {
  it('combines firstName + lastName with a single space', () => {
    expect(formatChildName({ childFirstName: 'Luka', childLastName: 'Horvat' })).toBe(
      'Luka Horvat',
    )
  })

  it('trims trailing space when lastName empty', () => {
    expect(formatChildName({ childFirstName: 'Luka', childLastName: '' })).toBe('Luka')
  })

  it('trims leading space when firstName empty', () => {
    expect(formatChildName({ childFirstName: '', childLastName: 'Horvat' })).toBe('Horvat')
  })

  it('returns fallback when both empty', () => {
    expect(formatChildName({ childFirstName: '', childLastName: '' })).toBe('–')
  })

  it('uses custom fallback', () => {
    expect(
      formatChildName({ childFirstName: '', childLastName: '' }, '(nepoznato)'),
    ).toBe('(nepoznato)')
  })

  it('returns fallback when both whitespace-only', () => {
    expect(formatChildName({ childFirstName: '   ', childLastName: '\t' })).toBe('–')
  })
})

describe('formatDateKey', () => {
  it('formats a YYYY-MM-DD key into dd.MM.yyyy.', () => {
    expect(formatDateKey('2026-07-15')).toBe('15.07.2026.')
  })

  it('passes through non-key strings unchanged', () => {
    expect(formatDateKey('')).toBe('')
    expect(formatDateKey('not-a-date')).toBe('not-a-date')
  })
})

describe('formatGroupSchedule', () => {
  it('renders a date range with time for radionice', () => {
    expect(
      formatGroupSchedule({
        isCustom: true,
        dateStart: '2026-07-15',
        dateEnd: '2026-07-21',
        startTime: '09:00',
        endTime: '11:00',
      }),
    ).toBe('15.07.2026. – 21.07.2026. · 09:00–11:00')
  })

  it('collapses to a single date when start === end', () => {
    expect(
      formatGroupSchedule({
        isCustom: true,
        dateStart: '2026-07-15',
        dateEnd: '2026-07-15',
        startTime: '09:00',
        endTime: '11:00',
      }),
    ).toBe('15.07.2026. · 09:00–11:00')
  })

  it('renders the weekday + time for standard programs', () => {
    expect(
      formatGroupSchedule({
        isCustom: false,
        dayOfWeek: 'Ponedjeljak',
        startTime: '17:00',
        endTime: '18:30',
      }),
    ).toBe('Ponedjeljak · 17:00–18:30')
  })

  it('falls back to weekday when isCustom but no date range supplied', () => {
    expect(
      formatGroupSchedule({
        isCustom: true,
        dayOfWeek: 'Ponedjeljak',
        startTime: '17:00',
        endTime: '18:30',
      }),
    ).toBe('Ponedjeljak · 17:00–18:30')
  })

  it('emits just the time when no weekday or date is set', () => {
    expect(formatGroupSchedule({ startTime: '17:00', endTime: '18:30' })).toBe('17:00–18:30')
  })

  it('emits an empty string when no parts are supplied', () => {
    expect(formatGroupSchedule({})).toBe('')
  })
})

describe('DAYS_HR', () => {
  it('contains 7 Croatian weekday names in Mon..Sun order', () => {
    expect(DAYS_HR).toEqual([
      'Ponedjeljak',
      'Utorak',
      'Srijeda',
      'Četvrtak',
      'Petak',
      'Subota',
      'Nedjelja',
    ])
  })
})
