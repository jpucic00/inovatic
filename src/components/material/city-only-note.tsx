import { MapPin } from 'lucide-react'
import type { City } from '@prisma/client'
import { CITY_LABELS } from '@/lib/city'

/**
 * "Samo Split" + the reason, under a material's title. The reason is a visible
 * line, not a tooltip: an admin on a tablet must be able to read why the other
 * city's curriculum differs, and drift that has to be hovered to be seen is
 * drift nobody notices.
 */
export function CityOnlyNote({
  city,
  reason,
}: Readonly<{ city: City | null | undefined; reason: string | null | undefined }>) {
  if (!city) return null
  return (
    <div className="mt-1.5 space-y-0.5">
      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        <MapPin className="h-3 w-3" aria-hidden="true" />
        Samo {CITY_LABELS[city]}
      </span>
      {reason ? <p className="text-xs text-gray-600 break-words">Razlog: {reason}</p> : null}
    </div>
  )
}

/**
 * Turns on the city controls of a material list. Passed only by ADMIN views of a
 * shared program's curriculum — never on a group page and never for a
 * radionica, which belongs to one city as a whole (the server refuses both).
 */
export type MaterialCityControls = { viewerCity: City }

type CityRow = {
  scope: string
  city?: City | null
  otherCityOnly?: boolean
  canEdit?: boolean
}

/** Whether a row gets "Samo za <grad>…" / "Vrati u oba grada". */
export function offersCityChoice(row: CityRow, controls: MaterialCityControls | null | undefined): boolean {
  return Boolean(controls) && row.scope !== 'GROUP' && row.otherCityOnly !== true && row.canEdit !== false
}

/** The edit dialog's "where does this change land" line, or null. */
export function cityEditNotice(row: CityRow, controls: MaterialCityControls | null | undefined): string | null {
  if (!offersCityChoice(row, controls)) return null
  return row.city ? `Materijal vrijedi samo za ${CITY_LABELS[row.city]}.` : 'Promjena vrijedi u oba grada.'
}
