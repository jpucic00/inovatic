import { afterEach, describe, expect, it } from 'vitest'
import {
  DAYS_HR,
  formatChildName,
  formatDate,
  formatDateKey,
  formatDateTime,
  formatEurCents,
  formatGroupSchedule,
  formatHours,
  formatModuleDateRange,
  formatMonthYear,
  formatTime,
} from '@/lib/format'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12))

describe('formatDate — short (default)', () => {
  it('produces compact dd.MM.yyyy. with a trailing dot', () => {
    expect(formatDate(utc(2026, 5, 15))).toBe('15.05.2026.')
  })

  it('zero-pads day and month', () => {
    expect(formatDate(utc(2026, 1, 5))).toBe('05.01.2026.')
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
        dateRange: true,
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
        dateRange: true,
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
        dateRange: false,
        dayOfWeek: 'Ponedjeljak',
        startTime: '17:00',
        endTime: '18:30',
      }),
    ).toBe('Ponedjeljak · 17:00–18:30')
  })

  it('falls back to weekday when dateRange is set but no date range supplied', () => {
    expect(
      formatGroupSchedule({
        dateRange: true,
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

describe('formatHours', () => {
  it('renders minutes as Croatian hours with a decimal comma', () => {
    expect(formatHours(90)).toBe('1,5 h')
    expect(formatHours(60)).toBe('1 h')
    expect(formatHours(750)).toBe('12,5 h')
    expect(formatHours(0)).toBe('0 h')
  })
})

describe('formatEurCents', () => {
  // Intl separates the amount from the symbol with a NON-BREAKING space, which
  // is what keeps "18,75 €" from wrapping mid-figure — spelled out here so a
  // future edit doesn't "fix" it to a plain space.
  const eur = (amount: string) => `${amount} €`

  it('renders euro cents in Croatian currency format', () => {
    expect(formatEurCents(1875)).toBe(eur('18,75'))
    expect(formatEurCents(1250)).toBe(eur('12,50'))
    expect(formatEurCents(0)).toBe(eur('0,00'))
  })

  it('keeps two decimals on a whole-euro rate', () => {
    expect(formatEurCents(1200)).toBe(eur('12,00'))
  })
})

describe('formatMonthYear', () => {
  it('capitalizes the Croatian month name', () => {
    expect(formatMonthYear(2026, 7)).toBe('Srpanj 2026.')
    expect(formatMonthYear(2026, 1)).toBe('Siječanj 2026.')
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

describe('timezone pinning', () => {
  // Every stored DateTime is a UTC instant, so these assertions are the whole
  // contract: the output names the Croatian calendar day and wall clock, not
  // the one belonging to whichever machine happens to run the formatter.
  const ORIGINAL_TZ = process.env.TZ
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it('renders the Zagreb wall clock, not UTC', () => {
    // 13:00 UTC is 15:00 in Zagreb — the two-hour gap an admin noticed on the
    // upit list, where a signup made at 15:00 read back as 13:00.
    expect(formatTime(new Date('2026-08-19T13:00:00Z'))).toBe('15:00')
    expect(formatDateTime(new Date('2026-08-19T13:00:00Z'))).toBe('19.08.2026. u 15:00')
  })

  it('rolls the calendar day over at Croatian midnight, not UTC midnight', () => {
    // 22:30 UTC is already 00:30 the next day in Zagreb (CEST, +2).
    expect(formatDate(new Date('2026-08-19T22:30:00Z'))).toBe('20.08.2026.')
    // …and +1 in winter, so the rollover moves with the offset rather than
    // being a fixed two hours baked into the formatter.
    expect(formatDate(new Date('2026-01-15T23:30:00Z'))).toBe('16.01.2026.')
    expect(formatDate(new Date('2026-01-15T22:30:00Z'))).toBe('15.01.2026.')
  })

  it('leaves @db.Date values on their own calendar day', () => {
    // Prisma hands back a date-only column as UTC midnight. Zagreb is ahead of
    // UTC year-round, so it reads 01:00/02:00 the SAME day — date-only columns
    // (module schedules, sessionDate, EnrollmentMonth) are untouched by the pin.
    expect(formatDate(new Date('2026-08-19T00:00:00Z'))).toBe('19.08.2026.')
    expect(formatDate(new Date('2026-01-15T00:00:00Z'))).toBe('15.01.2026.')
    expect(
      formatModuleDateRange(
        new Date('2026-07-15T00:00:00Z'),
        new Date('2026-07-22T00:00:00Z'),
      ),
    ).toBe(' (15.07. – 22.07.2026.)')
  })

  it('produces the same output whatever timezone the process runs in', () => {
    // The regression this guards: a Railway container defaults to UTC while a
    // developer's machine is Europe/Zagreb, so an unpinned formatter passed
    // locally and shipped wrong. Kiritimati (+14) and Los Angeles (-7) sit
    // either side of the date line from Zagreb.
    const instant = new Date('2026-08-19T22:30:00Z')
    const zones = ['UTC', 'Asia/Tokyo', 'Pacific/Kiritimati', 'America/Los_Angeles']

    const rendered = zones.map((tz) => {
      process.env.TZ = tz
      return {
        tz,
        date: formatDate(instant),
        long: formatDate(instant, 'long'),
        time: formatTime(instant),
      }
    })

    for (const r of rendered) {
      expect({ ...r, tz: 'ignored' }).toEqual({
        tz: 'ignored',
        date: '20.08.2026.',
        long: rendered[0].long,
        time: '00:30',
      })
    }
  })
})
