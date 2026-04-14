export function computeSchoolYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

export function getNextSchoolYear(current: string): string {
  const [startYear] = current.split('/').map(Number)
  return `${startYear + 1}/${startYear + 2}`
}
