/**
 * The printable school-year calendar ("Raspored radionica") as data: months →
 * calendar weeks → seven cells, Monday first. What a cell says is decided here
 * once, so the PDF template only paints.
 *
 * Client-safe and Prisma-free: the Kalendar view reads `standardModuleWindows`
 * from here too, which is what keeps the PDF and the Kalendar on the same
 * derivation input.
 */
import type { City } from '@prisma/client'
import { CITY_LABELS } from '@/lib/city'
import { STANDARD_PROGRAM_SESSION_TARGET } from '@/lib/constants'
import { ACTIVE_WEEKDAYS, type ActiveWeekday } from '@/lib/group-end-dates'
import { addDays, fromDateKey, toDateKey } from '@/lib/session-dates'

const MONTH_NAMES = [
  'Siječanj',
  'Veljača',
  'Ožujak',
  'Travanj',
  'Svibanj',
  'Lipanj',
  'Srpanj',
  'Kolovoz',
  'Rujan',
  'Listopad',
  'Studeni',
  'Prosinac',
] as const

type CalendarCellState = 'SESSION' | 'HOLIDAY' | 'NONE'

export type CalendarCell = {
  /** YYYY-MM-DD, or null for a day that belongs to the neighbouring month. */
  dateKey: string | null
  /** "6.10." — empty for a null date. */
  label: string
  state: CalendarCellState
  /** The weekday's first / 28th termin — the rows parents look for. */
  marker?: 'FIRST' | 'LAST'
  /** Only on a single-day holiday that falls on a termin weekday. */
  holidayName?: string
}

type CalendarMonth = {
  label: string
  /** Each week is exactly seven cells, Ponedjeljak … Nedjelja. */
  weeks: CalendarCell[][]
}

export type SchoolYearCalendar = {
  months: CalendarMonth[]
  weekCount: number
}

type WeekdaySessions = {
  sessionDatesByWeekday: Record<ActiveWeekday, string[]>
  lastSessionDateByWeekday: Record<ActiveWeekday, string | null>
}

type HolidayInput = { dateKey: string; name: string | null }

/**
 * The module windows the Kalendar derives its termini from: every standard
 * program's modules, flattened. One helper for both the Kalendar view and the
 * PDF loader, so the two can never be fed different windows.
 */
export function standardModuleWindows(
  courses: ReadonlyArray<{
    modules: ReadonlyArray<{ startDateKey: string | null; endDateKey: string | null }>
  }>,
): { startDate: Date | null; endDate: Date | null }[] {
  return courses.flatMap((c) =>
    c.modules.map((m) => ({
      startDate: m.startDateKey ? fromDateKey(m.startDateKey) : null,
      endDate: m.endDateKey ? fromDateKey(m.endDateKey) : null,
    })),
  )
}

/**
 * The weekdays that do not reach all 28 termini. A calendar with any of them
 * would promise parents a programme the year cannot deliver, so the PDF is
 * refused instead of printed short.
 */
export function incompleteWeekdays(sessions: WeekdaySessions): ActiveWeekday[] {
  return ACTIVE_WEEKDAYS.filter((w) => sessions.lastSessionDateByWeekday[w] === null)
}

function dayLabel(dateKey: string): string {
  const d = fromDateKey(dateKey)
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`
}

/** Monday-first weekday index: 0 = Ponedjeljak … 6 = Nedjelja. */
function mondayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

export function buildSchoolYearCalendar(
  input: WeekdaySessions & { holidays: ReadonlyArray<HolidayInput> },
): SchoolYearCalendar {
  const sessions = new Set<string>()
  const markers = new Map<string, 'FIRST' | 'LAST'>()
  for (const w of ACTIVE_WEEKDAYS) {
    const dates = input.sessionDatesByWeekday[w]
    for (const key of dates) sessions.add(key)
    if (dates[0]) markers.set(dates[0], 'FIRST')
    const last = input.lastSessionDateByWeekday[w]
    if (last) markers.set(last, 'LAST')
  }
  if (sessions.size === 0) return { months: [], weekCount: 0 }

  const holidayNames = new Map(input.holidays.map((h) => [h.dateKey, h.name?.trim() ?? '']))
  const sorted = [...sessions].sort((a, b) => a.localeCompare(b))
  const first = fromDateKey(sorted[0])
  const last = fromDateKey(sorted.at(-1) ?? sorted[0])

  function cellFor(date: Date): CalendarCell {
    const dateKey = toDateKey(date)
    const label = dayLabel(dateKey)
    if (holidayNames.has(dateKey)) {
      const name = holidayNames.get(dateKey)
      // A lone holiday is worth naming (a parent wonders why that Thursday is
      // off); a break is self-explanatory, and naming each of its days would
      // just repeat one word down a column. Sundays never have a termin.
      const single =
        !holidayNames.has(toDateKey(addDays(date, -1))) &&
        !holidayNames.has(toDateKey(addDays(date, 1)))
      return {
        dateKey,
        label,
        state: 'HOLIDAY',
        ...(single && name && mondayIndex(date) < 6 ? { holidayName: name } : {}),
      }
    }
    if (sessions.has(dateKey)) {
      const marker = markers.get(dateKey)
      return { dateKey, label, state: 'SESSION', ...(marker ? { marker } : {}) }
    }
    return { dateKey, label, state: 'NONE' }
  }

  const months: CalendarMonth[] = []
  let weekCount = 0
  let year = first.getUTCFullYear()
  let month = first.getUTCMonth()
  const endMonth = last.getUTCFullYear() * 12 + last.getUTCMonth()
  while (year * 12 + month <= endMonth) {
    const monthStart = new Date(Date.UTC(year, month, 1))
    const nextMonthStart = new Date(Date.UTC(year, month + 1, 1))
    const weeks: CalendarCell[][] = []
    let weekStart = addDays(monthStart, -mondayIndex(monthStart))
    while (weekStart.getTime() < nextMonthStart.getTime()) {
      const week: CalendarCell[] = []
      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i)
        week.push(
          day.getUTCMonth() === month
            ? cellFor(day)
            : { dateKey: null, label: '', state: 'NONE' },
        )
      }
      weeks.push(week)
      weekStart = addDays(weekStart, 7)
    }
    months.push({ label: MONTH_NAMES[month], weeks })
    weekCount += weeks.length
    month += 1
    if (month === 12) {
      month = 0
      year += 1
    }
  }
  return { months, weekCount }
}

/** "2025/2026" → "2025./2026." — how the document names a school year. */
export function formatSchoolYearDotted(schoolYear: string): string {
  return schoolYear
    .split('/')
    .map((y) => `${y}.`)
    .join('/')
}

/** The document's own name, also its download and attachment filename. */
export function schoolYearCalendarFilename(city: City, schoolYear: string): string {
  return `Raspored radionica ${formatSchoolYearDotted(schoolYear).replace('/', '-')} – ${CITY_LABELS[city]}.pdf`
}

export const SCHOOL_YEAR_CALENDAR_TOTALS = {
  sessions: STANDARD_PROGRAM_SESSION_TARGET,
}
