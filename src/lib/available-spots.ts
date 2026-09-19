/**
 * The one wording for remaining seats in a group, shared by the admin capacity
 * chip, the signup form's termin dropdown and the public schedule — a parent
 * and an admin must read the same number the same way.
 *
 * Croatian counts by the last digit: 1 → "slobodno mjesto", 2–4 → "slobodna
 * mjesta", everything else (5+, and 11–14) → "slobodnih mjesta". Two seats or
 * fewer are prefixed "Još", which is also the amber "last seats" tone; none
 * reads "Popunjeno".
 */

type AvailableSpotsTone = 'full' | 'low' | 'open'

export function availableSpotsTone(availableSpots: number): AvailableSpotsTone {
  if (availableSpots <= 0) return 'full'
  return availableSpots <= 2 ? 'low' : 'open'
}

export function formatAvailableSpots(availableSpots: number): string {
  const tone = availableSpotsTone(availableSpots)
  if (tone === 'full') return 'Popunjeno'
  const noun = spotsNoun(availableSpots)
  return tone === 'low' ? `Još ${availableSpots} ${noun}` : `${availableSpots} ${noun}`
}

function spotsNoun(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (last === 1 && lastTwo !== 11) return 'slobodno mjesto'
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'slobodna mjesta'
  return 'slobodnih mjesta'
}
