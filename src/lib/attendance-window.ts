/**
 * When a TEACHER is allowed to record attendance.
 *
 * Teaching hours are the payout basis, so the marking window is deliberately
 * narrow: the **current calendar month, up to and including today**. Future
 * dates would let a teacher self-credit hours for classes not yet held, and
 * locking out earlier months forces attendance to be kept current on the group
 * rather than filled in wholesale at month end.
 *
 * ADMINS are deliberately unrestricted — `src/actions/admin/attendance.ts` is
 * the correction path for a session that was genuinely missed, so a forgotten
 * Friday never becomes permanently unrecordable.
 */

/** Today's calendar date in Europe/Zagreb, as a `YYYY-MM-DD` key. */
export function zagrebDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zagreb',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export type MarkingWindow = {
  /** `YYYY-MM-01` of the current Zagreb month. */
  firstOfMonth: string
  /** Today's Zagreb date. */
  today: string
}

/**
 * Anchored on the Europe/Zagreb date so the 1st doesn't flip a couple of hours
 * early on a UTC server — the same anchoring `monthWindows` uses for the report.
 */
export function teacherMarkingWindow(now: Date): MarkingWindow {
  const today = zagrebDateKey(now)
  return { firstOfMonth: `${today.slice(0, 7)}-01`, today }
}

/**
 * `YYYY-MM-DD` keys compare correctly as strings, so no Date parsing is needed
 * (and none of it can drift across a timezone boundary).
 */
export function isTeacherMarkableDate(dateKey: string, now: Date): boolean {
  const { firstOfMonth, today } = teacherMarkingWindow(now)
  return dateKey >= firstOfMonth && dateKey <= today
}

/** Croatian rejection reason, or `null` when the date is markable. */
export function teacherMarkingError(dateKey: string, now: Date): string | null {
  const { firstOfMonth, today } = teacherMarkingWindow(now)
  if (dateKey > today) return 'Ne možete evidentirati dolazak za budući termin.'
  if (dateKey < firstOfMonth) {
    return 'Možete evidentirati samo termine tekućeg mjeseca. Za raniji termin javite se administratoru.'
  }
  return null
}
