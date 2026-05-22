import { Archive } from 'lucide-react'

/** Shown on year-scoped admin pages when the selected year is in the past. */
export function ArchivedYearBanner({ year }: Readonly<{ year: string }>) {
  return (
    <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-sm text-amber-800">
        Pregledavate arhiviranu školsku godinu <strong>{year}</strong>. Podaci su samo za
        pregled — za izmjene odaberite tekuću školsku godinu u izborniku.
      </p>
    </div>
  )
}
