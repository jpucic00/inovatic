import type { City } from '@prisma/client'

// Single source for the City tenant enum, shared by server and client. The
// `satisfies readonly City[]` keeps this tuple in lock-step with the Prisma
// enum (a renamed/added member is a tsc error here) while preserving the
// literal tuple type that `z.enum(CITY_VALUES)` needs.
export const CITY_VALUES = ['SPLIT', 'SIBENIK'] as const satisfies readonly City[]

export const CITY_LABELS: Record<City, string> = {
  SPLIT: 'Split',
  SIBENIK: 'Šibenik',
}

/** Runtime guard for untrusted city input (query params, etc.). */
export function isCity(value: unknown): value is City {
  return typeof value === 'string' && (CITY_VALUES as readonly string[]).includes(value)
}

// URL slug form for the public `?grad=` filter (novosti). Single source so the
// server (parse) and the links/pills (build) never drift.
const CITY_SLUGS: Record<City, string> = {
  SPLIT: 'split',
  SIBENIK: 'sibenik',
}

/** City → `?grad=` slug (e.g. SIBENIK → "sibenik"). */
export function citySlug(city: City): string {
  return CITY_SLUGS[city]
}

/** Parse an untrusted `?grad=` slug back to a City; null when unrecognized. */
export function cityFromSlug(slug: unknown): City | null {
  if (typeof slug !== 'string') return null
  const lower = slug.toLowerCase()
  return CITY_VALUES.find((c) => CITY_SLUGS[c] === lower) ?? null
}
