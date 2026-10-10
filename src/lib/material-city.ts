import type { City } from '@prisma/client'
import { CITY_LABELS } from '@/lib/city'
import type { AdminActionResult } from '@/lib/action-types'

/**
 * A material limited to one city ("Samo Split") belongs to that city: only its
 * staff edit, move or delete it. Shared curriculum (city null) stays editable
 * by both cities — that is the norm the owner wants (Materijali v2, 2026-10-10).
 */
export function otherCityOnlyError(
  materialCity: City | null,
  viewerCity: City | undefined,
): Extract<AdminActionResult, { success: false }> | null {
  if (materialCity === null || materialCity === viewerCity) return null
  return {
    success: false,
    error: `Ovaj materijal vrijedi samo za ${CITY_LABELS[materialCity]} — mijenja ga taj grad.`,
  }
}
