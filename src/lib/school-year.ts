export function computeSchoolYear(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

export function getNextSchoolYear(current: string): string {
  const [startYear] = current.split('/').map(Number)
  return `${startYear + 1}/${startYear + 2}`
}

// Archived = strictly before the current year. The current year and any
// future year (set up ahead of time) are editable.
export function isArchivedYear(year: string, now: Date = new Date()): boolean {
  return year < computeSchoolYear(now)
}

// Calendar window for a school year — Sept 1 to the next Sept 1 (exclusive).
// Used to bucket date-stamped records (e.g. inquiries) into a school year.
export function schoolYearDateRange(label: string): { gte: Date; lt: Date } {
  const startYear = Number.parseInt(label.split('/')[0], 10)
  return {
    gte: new Date(startYear, 8, 1),
    lt: new Date(startYear + 1, 8, 1),
  }
}
