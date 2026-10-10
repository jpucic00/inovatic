import { MapPin } from 'lucide-react'
import type { City } from '@prisma/client'
import { CITY_LABELS } from '@/lib/city'
import { croatianPlural } from '@/lib/format'

type CityCount = { city: City; count: number }

/**
 * "2 materijala vrijede samo za Split · 1 samo za Šibenik", own city first.
 * null when nothing is limited — the note is only worth showing as an exception.
 */
export function cityOnlySummaryText(counts: readonly CityCount[], viewerCity: City): string | null {
  const present = counts
    .filter((c) => c.count > 0)
    .sort((a, b) => Number(b.city === viewerCity) - Number(a.city === viewerCity))
  if (present.length === 0) return null
  return present
    .map(({ city, count }, index) => {
      const label = CITY_LABELS[city]
      if (index > 0) return `${count} samo za ${label}`
      const noun = croatianPlural(count, 'materijal vrijedi', 'materijala vrijede', 'materijala vrijedi')
      return `${count} ${noun} samo za ${label}`
    })
    .join(' · ')
}

/**
 * The program's city drift in one amber line next to "Lekcije". The curriculum
 * is meant to be identical in both cities, so every limited material is an
 * exception somebody chose — this keeps the total in sight without opening
 * every lesson.
 */
export function CityOnlySummary({
  counts,
  viewerCity,
}: Readonly<{ counts: readonly CityCount[]; viewerCity: City }>) {
  const text = cityOnlySummaryText(counts, viewerCity)
  if (!text) return null
  return (
    <p className="mb-3 inline-flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
      <MapPin className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}
