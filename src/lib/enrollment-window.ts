/**
 * Public signup-window semantics, shared by every UI surface that renders or
 * gates a program's enrollment window. The window lives per (course, school
 * year) on `CourseEnrollmentWindow`. A program is publicly enrollable only when
 * BOTH dates are set and `now` is inside [start, end]; an unset window means
 * signups are closed/hidden (not "always open").
 */

type WindowState = 'unset' | 'upcoming' | 'open' | 'closed'

export function getEnrollmentWindowState(
  start: Date | null | undefined,
  end: Date | null | undefined,
  now: Date = new Date(),
): WindowState {
  if (!start || !end) return 'unset'
  if (now < start) return 'upcoming'
  if (now > end) return 'closed'
  return 'open'
}

/** True when signups are currently open for the given window. */
export function isEnrollmentOpen(
  start: Date | null | undefined,
  end: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return getEnrollmentWindowState(start, end, now) === 'open'
}

export const ENROLLMENT_WINDOW_LABEL: Record<WindowState, string> = {
  unset: 'Nije postavljeno',
  upcoming: 'Uskoro',
  open: 'Otvoreno',
  closed: 'Zatvoreno',
}

export const ENROLLMENT_WINDOW_COLOR: Record<WindowState, string> = {
  unset: 'text-gray-400',
  upcoming: 'text-amber-600',
  open: 'text-green-600',
  closed: 'text-gray-500',
}
