type DateStyle = 'short' | 'long'

export function formatDate(date: Date | null, style: DateStyle = 'short'): string {
  if (!date) return ''
  if (style === 'long') {
    return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
  }
  return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) + '.'
}

/** Build display name from child name fields. */
export function formatChildName(
  fields: { childFirstName: string; childLastName: string },
  fallback = '–',
): string {
  const full = `${fields.childFirstName} ${fields.childLastName}`.trim()
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
