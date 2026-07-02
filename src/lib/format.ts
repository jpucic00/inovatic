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

type GroupScheduleParts = {
  isCustom?: boolean
  dayOfWeek?: string | null
  dateStart?: string | null
  dateEnd?: string | null
  startTime?: string | null
  endTime?: string | null
}

/**
 * Build the human-readable termin line for a ScheduledGroup. Radionice (isCustom)
 * with a [dateStart, dateEnd] range render as "15.07.2026. – 21.07.2026." (or
 * a single date when start === end); standard programs render the Croatian
 * weekday name. The time range is always appended when startTime is present.
 */
export function formatGroupSchedule(parts: GroupScheduleParts): string {
  const segments: string[] = []
  if (parts.isCustom && parts.dateStart && parts.dateEnd) {
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
