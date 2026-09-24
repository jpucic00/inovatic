import { describe, expect, it } from 'vitest'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import {
  computeSchoolYearPlan,
  deriveSessionDatesFromWindows,
} from '@/lib/school-year-planner'
import { addDays, fromDateKey, toDateKey } from '@/lib/session-dates'
import {
  buildSchoolYearCalendar,
  incompleteWeekdays,
  schoolYearCalendarFilename,
  standardModuleWindows,
  type CalendarCell,
} from '@/lib/school-year-calendar'

function range(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = fromDateKey(from); d <= fromDateKey(to); d = addDays(d, 1)) out.push(toDateKey(d))
  return out
}

/**
 * The 2025/2026 Split year exactly as the association's old Word calendar
 * printed it: kickoff Monday 6.10.2025 and that document's holidays.
 */
const HOLIDAYS_2025 = [
  { dateKey: '2025-11-01', name: 'Svi sveti' },
  { dateKey: '2025-11-17', name: null },
  { dateKey: '2025-11-18', name: 'Dan sjećanja na Vukovar' },
  ...range('2025-12-24', '2026-01-10').map((dateKey) => ({ dateKey, name: null })),
  ...range('2026-03-30', '2026-04-06').map((dateKey) => ({ dateKey, name: null })),
  { dateKey: '2026-05-01', name: 'Praznik rada' },
  { dateKey: '2026-05-07', name: 'Sv. Duje' },
  { dateKey: '2026-05-30', name: 'Dan državnosti' },
]

function example2025() {
  const holidayDates = new Set(HOLIDAYS_2025.map((h) => h.dateKey))
  const plan = computeSchoolYearPlan({
    startDate: fromDateKey('2025-10-06'),
    activeWeekdays: ACTIVE_WEEKDAYS,
    holidayDates,
  })
  // Stored the way the Kalendar reads it back: every standard program carries
  // the same four windows, and the derivation runs over all of them.
  const course = {
    modules: plan.modules.map((m) => ({
      startDateKey: toDateKey(m.startDate),
      endDateKey: toDateKey(m.endDate),
    })),
  }
  const sessions = deriveSessionDatesFromWindows({
    moduleWindows: standardModuleWindows([course, course, course]),
    holidayDates,
  })
  return { sessions, calendar: buildSchoolYearCalendar({ ...sessions, holidays: HOLIDAYS_2025 }) }
}

function allCells(calendar: ReturnType<typeof buildSchoolYearCalendar>): CalendarCell[] {
  return calendar.months.flatMap((m) => m.weeks.flat())
}

function cell(calendar: ReturnType<typeof buildSchoolYearCalendar>, dateKey: string) {
  const found = allCells(calendar).find((c) => c.dateKey === dateKey)
  if (!found) throw new Error(`no cell for ${dateKey}`)
  return found
}

describe('buildSchoolYearCalendar — the 2025/2026 Word calendar', () => {
  it('ends each weekday on the same ZADNJA dates the old document printed', () => {
    const { calendar } = example2025()
    const last = allCells(calendar)
      .filter((c) => c.marker === 'LAST')
      .map((c) => c.dateKey)
    expect(last).toEqual([
      '2026-05-12', // Uto
      '2026-05-13', // Sri
      '2026-05-18', // Pon
      '2026-05-21', // Čet
      '2026-05-22', // Pet
      '2026-05-23', // Sub
    ])
  })

  it('starts every weekday in the kickoff week with PRVA', () => {
    const { calendar } = example2025()
    const first = allCells(calendar)
      .filter((c) => c.marker === 'FIRST')
      .map((c) => c.dateKey)
    expect(first).toEqual([
      '2025-10-06',
      '2025-10-07',
      '2025-10-08',
      '2025-10-09',
      '2025-10-10',
      '2025-10-11',
    ])
  })

  it('reaches all 28 termini on every weekday', () => {
    const { sessions } = example2025()
    expect(incompleteWeekdays(sessions)).toEqual([])
    for (const w of ACTIVE_WEEKDAYS) expect(sessions.sessionDatesByWeekday[w]).toHaveLength(28)
  })

  it('spans October to May, one row per calendar week, Monday first', () => {
    const { calendar } = example2025()
    expect(calendar.months.map((m) => m.label)).toEqual([
      'Listopad',
      'Studeni',
      'Prosinac',
      'Siječanj',
      'Veljača',
      'Ožujak',
      'Travanj',
      'Svibanj',
    ])
    const listopad = calendar.months[0]
    expect(listopad.weeks).toHaveLength(5)
    // 1.10.2025 is a Wednesday: Mon and Tue of that row belong to September.
    expect(listopad.weeks[0].map((c) => c.label)).toEqual(['', '', '1.10.', '2.10.', '3.10.', '4.10.', '5.10.'])
    expect(calendar.weekCount).toBe(calendar.months.reduce((n, m) => n + m.weeks.length, 0))
  })

  it('paints holidays blue on every weekday, Sundays included', () => {
    const { calendar } = example2025()
    for (const key of ['2025-12-24', '2025-12-28', '2026-01-04', '2026-04-05', '2026-01-10']) {
      expect(cell(calendar, key).state).toBe('HOLIDAY')
    }
  })

  it('leaves Sundays, pre-kickoff days and days after a weekday ends white', () => {
    const { calendar } = example2025()
    expect(cell(calendar, '2025-10-12').state).toBe('NONE') // Sunday
    expect(cell(calendar, '2025-10-01').state).toBe('NONE') // before PRVA
    expect(cell(calendar, '2026-05-19').state).toBe('NONE') // Tuesday after its ZADNJA
    expect(cell(calendar, '2026-05-25').state).toBe('NONE')
    expect(cell(calendar, '2026-05-11').state).toBe('SESSION')
  })

  it('names a single-day holiday on a termin weekday, never a day of a break', () => {
    const { calendar } = example2025()
    expect(cell(calendar, '2026-05-07').holidayName).toBe('Sv. Duje')
    expect(cell(calendar, '2025-11-01').holidayName).toBe('Svi sveti')
    // 18.11. is named but sits next to 17.11. — a two-day break, so plain blue.
    expect(cell(calendar, '2025-11-18').holidayName).toBeUndefined()
    expect(cell(calendar, '2025-12-25').holidayName).toBeUndefined()
  })

  it('stays white-only and monthless for a year with no plan', () => {
    const empty = deriveSessionDatesFromWindows({ moduleWindows: [], holidayDates: new Set() })
    expect(buildSchoolYearCalendar({ ...empty, holidays: [] })).toEqual({ months: [], weekCount: 0 })
    expect(incompleteWeekdays(empty)).toEqual([...ACTIVE_WEEKDAYS])
  })
})

describe('schoolYearCalendarFilename', () => {
  it('names the year and the city the way the document does', () => {
    expect(schoolYearCalendarFilename('SPLIT', '2026/2027')).toBe(
      'Raspored radionica 2026.-2027. – Split.pdf',
    )
    expect(schoolYearCalendarFilename('SIBENIK', '2026/2027')).toBe(
      'Raspored radionica 2026.-2027. – Šibenik.pdf',
    )
  })
})
