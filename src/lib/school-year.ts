// A school year starts on 1 September. The one cutoff behind both a moment
// (`computeSchoolYear`) and a calendar date (`schoolYearOfDateKey`).
function schoolYearFor(year: number, month: number): string {
  return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

export function computeSchoolYear(now: Date = new Date()): string {
  return schoolYearFor(now.getFullYear(), now.getMonth() + 1)
}

/** The school year a `YYYY-MM-DD` date falls in. */
export function schoolYearOfDateKey(dateKey: string): string {
  return schoolYearFor(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)))
}

export function getNextSchoolYear(current: string): string {
  const [startYear] = current.split('/').map(Number)
  return `${startYear + 1}/${startYear + 2}`
}

export function getPreviousSchoolYear(current: string): string {
  const [startYear] = current.split('/').map(Number)
  return `${startYear - 1}/${startYear}`
}

// Archived = strictly before the current year. The current year and any
// future year (set up ahead of time) are editable.
export function isArchivedYear(year: string, now: Date = new Date()): boolean {
  return year < computeSchoolYear(now)
}

// A year still "needs planning" when it isn't archived and is missing either
// of the two setup inputs: standard-program module dates (the planner output)
// or marked holidays (a planner input + attendance exclusion). Drives the
// "plan the year" badge on the admin Kalendar nav link.
export function schoolYearNeedsPlanning(input: {
  archived: boolean
  datedModuleCount: number
  holidayCount: number
}): boolean {
  return !input.archived && (input.datedModuleCount === 0 || input.holidayCount === 0)
}
