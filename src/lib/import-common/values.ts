import type { RecommendationKind, SkillLevel } from '@prisma/client'

import { normalizeKey, type CellValue } from './grid'

// Cell-value coercers shared by the historical-workbook importers.

// ── Course + day vocabularies ────────────────────────────────────────────────

/** Tab-name token (SLR1) and full title (SVIJET LEGO ROBOTIKE 1) → course slug. */
const COURSE_BY_TOKEN: Record<string, string> = {
  SLR1: 'slr-1',
  SLR2: 'slr-2',
  SLR3: 'slr-3',
  SLR4: 'slr-4',
}

export function courseSlugFromLabel(label: string): string | null {
  const norm = normalizeKey(label)
  const compact = norm.replaceAll(' ', '')
  if (COURSE_BY_TOKEN[compact]) return COURSE_BY_TOKEN[compact]
  const title = /^SVIJET LEGO ROBOTIKE (\d)$/.exec(norm)
  if (title) return COURSE_BY_TOKEN[`SLR${title[1]}`] ?? null
  return null
}

/** Day abbreviation (PON) and full name (PONEDJELJAK) → app dayOfWeek value. */
const DAY_BY_KEY: Record<string, string> = {
  PON: 'Ponedjeljak', PONEDJELJAK: 'Ponedjeljak',
  UTO: 'Utorak', UTORAK: 'Utorak',
  SRI: 'Srijeda', SRIJEDA: 'Srijeda',
  CET: 'Četvrtak', CETVRTAK: 'Četvrtak',
  PET: 'Petak', PETAK: 'Petak',
  SUB: 'Subota', SUBOTA: 'Subota',
  NED: 'Nedjelja', NEDJELJA: 'Nedjelja',
}

export function dayOfWeekFromLabel(label: string): string | null {
  return DAY_BY_KEY[normalizeKey(label)] ?? null
}

// ── Time tokens ──────────────────────────────────────────────────────────────
// Accepts "18:30", "1830", "930", "20", "9" → canonical "18:30" / "9:30" /
// "20:00" / "9:00" (hour unpadded, minutes two-digit — the prod convention).

export function normalizeTimeToken(token: string): string | null {
  const t = token.trim().replaceAll('.', ':')
  let hours: number
  let minutes: number
  const withColon = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (withColon) {
    hours = Number(withColon[1])
    minutes = Number(withColon[2])
  } else if (/^\d{3,4}$/.test(t)) {
    hours = Number(t.slice(0, -2))
    minutes = Number(t.slice(-2))
  } else if (/^\d{1,2}$/.test(t)) {
    hours = Number(t)
    minutes = 0
  } else {
    return null
  }
  if (hours > 23 || minutes > 59) return null
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * Sniffs a school year out of a workbook filename ("Evidencija_Anić_2024_2025"
 * → "2024/2025"). Only two consecutive years count — anything else is null.
 * Used as a guard against importing a workbook under the wrong --year.
 */
export function inferSchoolYearFromFilename(fileName: string): string | null {
  const match = /(\d{4})[._/-](\d{4})/.exec(fileName)
  if (!match) return null
  const first = Number(match[1])
  const second = Number(match[2])
  if (second !== first + 1) return null
  return `${first}/${second}`
}

// ── Skill / recommendation / paid cells ──────────────────────────────────────

const SKILL_VALUE_MAP: Record<string, SkillLevel> = {
  'POCETNO': 'POCETNO',
  'U RAZVOJU': 'U_RAZVOJU',
  'U_RAZVOJU': 'U_RAZVOJU',
  'OSTVARENO': 'OSTVARENO',
}

export function parseSkillValue(value: CellValue): SkillLevel | null | 'unknown' {
  const norm = normalizeKey(value)
  if (!norm) return null
  return SKILL_VALUE_MAP[norm] ?? 'unknown'
}

export type ParsedRecommendation =
  | { kind: Exclude<RecommendationKind, 'COURSE'> }
  | { kind: 'COURSE'; courseSlug: string }

export function parseRecommendation(value: CellValue): ParsedRecommendation | null | 'unknown' {
  // Dashes vary between sheets (hyphen, en dash, em dash) and carry no meaning
  // in a preporuka — flatten them before matching.
  const norm = normalizeKey(value).replaceAll(/[–—]/g, '-').replaceAll(/\s*-\s*/g, ' - ')
  if (!norm) return null
  // PRIPR?EMA: the real 2025/2026 archive spells it "PRIPEMA" (missing R) in
  // places; singular/plural NATJECANJE/NATJECANJA both appear too.
  if (/^PRIPR?EMA ZA NATJECANJ[AE]$/.test(norm)) {
    return { kind: 'COMPETITION_PREP' }
  }
  // The per-team tracks: a mentor recommending FLL or WRO is naming the team a
  // child should join, so they are read before the program-level track.
  if (/(^|\s)FLL$/.test(norm) || norm === 'FLL') return { kind: 'COMPETITION_FLL' }
  if (/(^|\s)WRO$/.test(norm) || norm === 'WRO') return { kind: 'COMPETITION_WRO' }
  // Mentors write the program-level track as a sentence as often as bare —
  // "PRIJELAZ NA NATJECATELJSKI PROGRAM" is the commonest spelling in the
  // 2025/2026 competition archive.
  if (/(^|\s)NATJECATELJSKI PROGRAM$/.test(norm)) return { kind: 'COMPETITION_PROGRAM' }
  const courseSlug = courseSlugFromLabel(norm)
  if (courseSlug) return { kind: 'COURSE', courseSlug }
  return 'unknown'
}

export function parsePaidValue(value: CellValue): boolean | 'unknown' {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const norm = normalizeKey(value)
  if (!norm) return false
  if (['TRUE', 'DA', 'YES', '1', 'PLACENO', 'X', '✓', 'TOCNO'].includes(norm)) return true
  if (['FALSE', 'NE', 'NO', '0', 'NIJE PLACENO'].includes(norm)) return false
  return 'unknown'
}

// ── Contact cells ────────────────────────────────────────────────────────────

const PLAIN_EMAIL = /^\S+@\S+\.\S+$/

export function isPlainEmail(value: string): boolean {
  return PLAIN_EMAIL.test(value)
}

/**
 * Extracts a bare address from Outlook-style contact strings pasted into MAIL
 * cells: `Marija Perić <marija@outlook.com>` → `marija@outlook.com`. Also
 * strips a `mailto:` prefix and lowercases — the stored value must equal what
 * a parent later types into the inquiry form, or legacy matching breaks.
 */
export function sanitizeEmail(raw: string): string {
  let email = raw.trim()
  const angled = /<([^<>]+)>/.exec(email)
  if (angled) email = angled[1].trim()
  return email.replace(/^mailto:/i, '').trim().toLowerCase()
}
