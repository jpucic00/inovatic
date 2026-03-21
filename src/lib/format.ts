type DateStyle = 'short' | 'long'

export function formatDate(date: Date | null, style: DateStyle = 'short'): string {
  if (!date) return ''
  if (style === 'long') {
    return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
  }
  return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) + '.'
}

/** Build display name from split or legacy child name fields. */
export function formatChildName(
  fields: { childFirstName?: string | null; childLastName?: string | null; childName?: string | null },
  fallback = '–',
): string {
  if (fields.childFirstName) {
    return `${fields.childFirstName} ${fields.childLastName ?? ''}`.trim()
  }
  return fields.childName ?? fallback
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
