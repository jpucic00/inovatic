type DateStyle = 'short' | 'long'

/**
 * The zone every stored instant is rendered in.
 *
 * A `DateTime` column is a `TIMESTAMP(3)` holding a UTC instant, so displaying
 * one is a conversion — and an unnamed conversion silently follows whoever runs
 * it. The server side is a UTC container (two hours early all summer) and the
 * client side is the viewer's own clock, which means the same row could render
 * two different days either side of hydration. Naming the zone here is what
 * makes the server render, the browser render and the test run agree.
 *
 * `@db.Date` columns arrive from Prisma as UTC midnight; Zagreb is ahead of UTC
 * year-round, so those land on the same calendar day and are unaffected.
 */
export const APP_TIME_ZONE = 'Europe/Zagreb'

/**
 * Zero-padded day/month/year of an instant *in Zagreb*. `en-CA` is a formatting
 * detail, not a locale choice — it is asked only for 2-digit parts, which are
 * then reassembled by hand, so no Canadian ordering survives into the output.
 */
const PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function zonedParts(date: Date): { dd: string; mm: string; yyyy: string } {
  const parts = PARTS_FORMATTER.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return { dd: pick('day'), mm: pick('month'), yyyy: pick('year') }
}

export function formatDate(date: Date | null, style: DateStyle = 'short'): string {
  if (!date) return ''
  if (style === 'long') {
    return new Intl.DateTimeFormat('hr-HR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: APP_TIME_ZONE,
    }).format(date)
  }
  // Compact dd.MM.yyyy. — matches formatDateKey so adjacent admin UI agrees.
  // (Intl 'hr-HR' short would render "15. 05. 2026." with internal spaces.)
  const { dd, mm, yyyy } = zonedParts(date)
  return `${dd}.${mm}.${yyyy}.`
}

/**
 * A `@db.Date` column as the `yyyy-MM-dd` an `<input type="date">` wants.
 *
 * Read with `getUTC*`, NOT the local getters, and that is the whole point of
 * this living in one place. A date-only column arrives from Prisma as UTC
 * midnight, so on a machine at a negative offset the local getters name the
 * PREVIOUS day: `formatDate` would render 15.09.2026 beside an input opened on
 * the 14th, and saving the form without touching that field would write the 14th
 * back — silently moving every session of that module by a day. Before the app
 * pinned display to {@link APP_TIME_ZONE} both halves were local and agreed, so
 * that mismatch is a thing the pinning could introduce rather than an old bug.
 *
 * Deliberately NOT zoned through `APP_TIME_ZONE`: the stored value is a calendar
 * date with no time in it, and the round trip that matters is input → column →
 * input, not instant → wall clock.
 *
 * There were four hand-rolled copies of this and exactly one of them was right.
 * Add callers here rather than a fifth copy.
 */
export function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return ''
  const date = new Date(d)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Time of day as "HH:mm" in the app's zone. */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('hr-HR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

/**
 * An instant with its time of day, e.g. "19.08.2026. u 15:04" — the reading for
 * a record whose *moment* matters (an upit arriving, a consent being given),
 * as opposed to formatDate's calendar day.
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} u ${formatTime(date)}`
}

/** Build display name from child name fields. Empty/null (e.g. PARTY inquiries
 * with no child) yields the fallback. */
export function formatChildName(
  fields: { childFirstName: string | null; childLastName: string | null },
  fallback = '–',
): string {
  const full = `${fields.childFirstName ?? ''} ${fields.childLastName ?? ''}`.trim()
  return full || fallback
}

export const DAYS_HR = [
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
  'Nedjelja',
] as const

/**
 * Convert a YYYY-MM-DD string into Croatian short date "dd.MM.yyyy.". Returns
 * the input unchanged when it doesn't look like a YYYY-MM-DD key, so callers
 * can pass already-formatted strings through safely.
 */
export function formatDateKey(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  return `${m[3]}.${m[2]}.${m[1]}.`
}

/**
 * Format a pair of dates as a module schedule suffix, e.g. " (15.07. – 22.07.2026.)".
 * The leading space + parens allow direct concatenation after a module title.
 */
export function formatModuleDateRange(start: Date, end: Date): string {
  const s = zonedParts(start)
  const e = zonedParts(end)
  return ` (${s.dd}.${s.mm}. – ${e.dd}.${e.mm}.${e.yyyy}.)`
}

/**
 * Croatian plural agreement for a counted noun: 1 grupa, 2–4 grupe, 5+ grupa.
 * Decided by the last digit so 22 is "grupe" and 111 is "grupa", with the
 * 12–14 exception ("12 grupa").
 */
export function croatianPlural(n: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(n) % 100
  const last = lastTwo % 10
  if (last === 1 && lastTwo !== 11) return one
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few
  return many
}

/** Minutes as Croatian hours, e.g. 90 → "1,5 h". */
export function formatHours(minutes: number): string {
  const value = new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 }).format(
    minutes / 60,
  )
  return `${value} h`
}

/** Euro cents as Croatian currency, e.g. 1875 → "18,75 €". */
export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )
}

/** Month heading, e.g. (2026, 7) → "Srpanj 2026.". `month` is 1-12. */
export function formatMonthYear(year: number, month: number): string {
  const label = new Intl.DateTimeFormat('hr-HR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

type GroupScheduleParts = {
  /** Radionice run on a closed calendar range instead of a weekday. */
  dateRange?: boolean
  dayOfWeek?: string | null
  dateStart?: string | null
  dateEnd?: string | null
  startTime?: string | null
  endTime?: string | null
}

/**
 * Build the human-readable termin line for a ScheduledGroup. Groups on a
 * [dateStart, dateEnd] range (radionice — pass `dateRange`) render as
 * "15.07.2026. – 21.07.2026." (or a single date when start === end); weekly
 * groups (standard programs and the competitive track alike) render the
 * Croatian weekday name. The time range is always appended when startTime is
 * present.
 */
export function formatGroupSchedule(parts: GroupScheduleParts): string {
  const segments: string[] = []
  if (parts.dateRange && parts.dateStart && parts.dateEnd) {
    segments.push(
      parts.dateStart === parts.dateEnd
        ? formatDateKey(parts.dateStart)
        : `${formatDateKey(parts.dateStart)} – ${formatDateKey(parts.dateEnd)}`,
    )
  } else if (parts.dayOfWeek) {
    segments.push(parts.dayOfWeek)
  }
  if (parts.startTime) {
    segments.push(parts.endTime ? `${parts.startTime}–${parts.endTime}` : parts.startTime)
  }
  return segments.join(' · ')
}
