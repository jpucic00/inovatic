type DateStyle = 'short' | 'long'

export function formatDate(date: Date | null, style: DateStyle = 'short'): string {
  if (!date) return ''
  if (style === 'long') {
    return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
  }
  // Compact dd.MM.yyyy. — matches formatDateKey so adjacent admin UI agrees.
  // (Intl 'hr-HR' short would render "15. 05. 2026." with internal spaces.)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${date.getFullYear()}.`
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
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0')
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0')
  return ` (${dd(start)}.${mm(start)}. – ${dd(end)}.${mm(end)}.${end.getFullYear()}.)`
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
