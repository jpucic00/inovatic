import type { Prisma } from '@prisma/client'

/**
 * The four privole a family signs with the contract, one set per enrollment
 * (program + school year) — the same grain as "Ugovor potpisan", because they
 * are signed on the same paper.
 *
 * Each is three-state: `true` = Da, `false` = Ne, `null` = not entered yet.
 * **Null is never a yes.** Everywhere a photo could go out (the Dolazak marker,
 * the "Bez privole" filters) an unentered consent counts as withheld — a form
 * that has not been typed in yet must not read as permission. It stays distinct
 * from `false` only so the office can find the forms it still has to enter.
 *
 * Plain, client-safe module (only a type import from Prisma): the marker, the
 * profile card, the list column and the action all read the same vocabulary.
 */
export const CONSENT_KEYS = [
  'consentGallery',
  'consentWebsite',
  'consentSocial',
  'consentEmail',
] as const
export type ConsentKey = (typeof CONSENT_KEYS)[number]

export type EnrollmentConsents = Record<ConsentKey, boolean | null>

/** Worded as on the form the parents sign. */
export const CONSENT_LABELS: Record<ConsentKey, string> = {
  consentGallery: 'Zatvorena galerija',
  consentWebsite: 'Web-stranica',
  consentSocial: 'Facebook i Instagram',
  consentEmail: 'E-pošta o budućim programima',
}

/** For chips where the full label does not fit (Dolazak row, list column). */
export const CONSENT_SHORT_LABELS: Record<ConsentKey, string> = {
  consentGallery: 'Galerija',
  consentWebsite: 'Web',
  consentSocial: 'FB/IG',
  consentEmail: 'E-pošta',
}

/** The three that govern publishing a child's photo; e-pošta does not. */
export const PHOTO_CONSENT_KEYS = ['consentGallery', 'consentWebsite', 'consentSocial'] as const

export function pickConsents(source: EnrollmentConsents): EnrollmentConsents {
  return {
    consentGallery: source.consentGallery,
    consentWebsite: source.consentWebsite,
    consentSocial: source.consentSocial,
    consentEmail: source.consentEmail,
  }
}

type ConsentRestrictions = {
  /** Explicitly refused (Ne). */
  denied: ConsentKey[]
  /** Not entered yet — treated as withheld, listed separately. */
  missing: ConsentKey[]
}

/** Which of `keys` stop a publication, split by why. Empty lists = nothing to watch. */
export function consentRestrictions(
  consents: EnrollmentConsents,
  keys: readonly ConsentKey[] = CONSENT_KEYS,
): ConsentRestrictions {
  const denied: ConsentKey[] = []
  const missing: ConsentKey[] = []
  for (const key of keys) {
    if (consents[key] === false) denied.push(key)
    else if (consents[key] === null) missing.push(key)
  }
  return { denied, missing }
}

/**
 * One set out of several enrollments, strictest wins per consent: Ne beats
 * not-entered beats Da. Used where a row stands for a child rather than one
 * enrollment (the student list), so a child with two groups in a year is never
 * shown as more publishable than their stricter form allows. No enrollments
 * reads as nothing entered.
 */
export function strictestConsents(list: readonly EnrollmentConsents[]): EnrollmentConsents {
  const result = {} as EnrollmentConsents
  for (const key of CONSENT_KEYS) {
    const values = list.map((c) => c[key])
    if (values.includes(false)) result[key] = false
    else if (values.length === 0 || values.includes(null)) result[key] = null
    else result[key] = true
  }
  return result
}

// ── /admin/ucenici filter ────────────────────────────────────────────────────

const WITHHELD_FILTERS = {
  NO_GALLERY: 'consentGallery',
  NO_WEBSITE: 'consentWebsite',
  NO_SOCIAL: 'consentSocial',
  NO_EMAIL: 'consentEmail',
} as const satisfies Record<string, ConsentKey>

export const CONSENT_FILTER_VALUES = [
  'NO_GALLERY',
  'NO_WEBSITE',
  'NO_SOCIAL',
  'NO_EMAIL',
  'MISSING',
  'ALL_GIVEN',
] as const
export type ConsentFilter = (typeof CONSENT_FILTER_VALUES)[number]

export const CONSENT_FILTER_LABELS: Record<ConsentFilter, string> = {
  NO_GALLERY: `Bez privole: ${CONSENT_LABELS.consentGallery.toLowerCase()}`,
  NO_WEBSITE: `Bez privole: ${CONSENT_LABELS.consentWebsite.toLowerCase()}`,
  NO_SOCIAL: `Bez privole: ${CONSENT_LABELS.consentSocial}`,
  NO_EMAIL: `Bez privole: ${CONSENT_LABELS.consentEmail.toLowerCase()}`,
  MISSING: 'Privole nisu unesene',
  ALL_GIVEN: 'Sve privole dane',
}

export function parseConsentFilter(raw: string | undefined): ConsentFilter | undefined {
  return CONSENT_FILTER_VALUES.includes(raw as ConsentFilter) ? (raw as ConsentFilter) : undefined
}

/**
 * The condition ONE enrollment must meet for its child to match the filter.
 * The caller puts it inside the same `enrollments.some` as the year and the
 * group/program filters, so "bez privole za web u grupi X" asks about the
 * enrollment in X — not about some other group the child also attends.
 *
 * "Bez privole" covers Ne AND not-entered (see the module comment). Written as
 * an explicit OR because Prisma's `{ not: true }` follows SQL and skips NULLs.
 */
export function consentEnrollmentWhere(filter: ConsentFilter): Prisma.EnrollmentWhereInput {
  if (filter === 'MISSING') {
    return { OR: CONSENT_KEYS.map((key) => ({ [key]: null })) }
  }
  if (filter === 'ALL_GIVEN') {
    return { AND: CONSENT_KEYS.map((key) => ({ [key]: true })) }
  }
  const key = WITHHELD_FILTERS[filter]
  return { OR: [{ [key]: false }, { [key]: null }] }
}
