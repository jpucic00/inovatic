import type { RecommendationKind, SkillLevel } from '@prisma/client'

import type { SkillKey } from '../assessment-rubric'

// ── Grid model ───────────────────────────────────────────────────────────────
// Sheets arrive as plain 2-D value grids (row-major, 0-based) so every parser
// stays pure and unit-testable without touching an .xlsx reader.

export type CellValue = string | number | boolean | Date | null

export type Grid = CellValue[][]

export type WarningLevel = 'error' | 'warn' | 'info'

export type ImportWarning = {
  level: WarningLevel
  where: string
  message: string
}

// ── Normalization helpers ────────────────────────────────────────────────────

const DIACRITICS_MAP: Record<string, string> = {
  č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd',
  Č: 'C', Ć: 'C', Š: 'S', Ž: 'Z', Đ: 'D',
}

export function stripDiacritics(str: string): string {
  return str.replaceAll(/[čćšžđČĆŠŽĐ]/g, (ch) => DIACRITICS_MAP[ch] ?? ch)
}

/** Uppercase, diacritic-free, single-spaced, no trailing colon — for matching. */
function normalizeKey(value: CellValue): string {
  if (value === null || value === undefined) return ''
  return stripDiacritics(String(value))
    .toUpperCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')
    .trim()
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

/** "KRISTIAN MUTABDŽIJA" → "Kristian Mutabdžija" (per space/hyphen segment). */
export function titleCaseName(raw: string): string {
  return raw
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase()
    .replaceAll(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** Case/diacritic-insensitive identity key for a person name. */
export function personKey(firstName: string, lastName: string): string {
  return normalizeKey(firstName) + '|' + normalizeKey(lastName)
}

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

/** App dayOfWeek → prod group-name abbreviation (SRI). */
const DAY_ABBREV: Record<string, string> = {
  Ponedjeljak: 'PON', Utorak: 'UTO', Srijeda: 'SRI', Četvrtak: 'ČET',
  Petak: 'PET', Subota: 'SUB', Nedjelja: 'NED',
}

export function dayOfWeekFromLabel(label: string): string | null {
  return DAY_BY_KEY[normalizeKey(label)] ?? null
}

// ── Time tokens ──────────────────────────────────────────────────────────────
// Accepts "18:30", "1830", "930", "20", "9" → canonical "18:30" / "9:30" /
// "20:00" / "9:00" (hour unpadded, minutes two-digit — the prod convention).

export function normalizeTimeToken(token: string): string | null {
  const t = token.trim().replace(/\./g, ':')
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

// ── Group identity (tab names + prod group names) ────────────────────────────
// Contact tabs:  PON_SLR2_1830-20   ČET_SLR1_18:30-20:00   SUB_SLR1_900-1030
// Prod groups:   SRI_SLR1_18:30-20:00

export type GroupIdentity = {
  dayOfWeek: string
  courseSlug: string
  courseToken: string
  startTime: string | null
  endTime: string | null
}

export function identityKey(id: {
  courseSlug: string
  dayOfWeek: string
  startTime: string | null
}): string {
  return `${id.courseSlug}|${id.dayOfWeek}|${id.startTime ?? ''}`
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

export function parseGroupName(name: string): GroupIdentity | null {
  // Numbers → Excel export names split-out worksheets "PON_SLR2_1830-20 - Tablica 1";
  // real tab names never contain a spaced dash, so stripping the suffix is safe.
  const parts = name.replace(/\s+[-–]\s+.*$/, '').trim().split('_')
  if (parts.length < 2 || parts.length > 3) return null
  const dayOfWeek = dayOfWeekFromLabel(parts[0])
  const courseSlug = courseSlugFromLabel(parts[1])
  if (!dayOfWeek || !courseSlug) return null
  const courseToken = normalizeKey(parts[1]).replaceAll(' ', '')

  if (parts.length === 2) {
    return { dayOfWeek, courseSlug, courseToken, startTime: null, endTime: null }
  }
  const range = /^([^-]+)-([^-]+)$/.exec(parts[2].trim())
  if (!range) return null
  const startTime = normalizeTimeToken(range[1])
  const endTime = normalizeTimeToken(range[2])
  if (!startTime || !endTime) return null
  return { dayOfWeek, courseSlug, courseToken, startTime, endTime }
}

/** Canonical prod-style group name: SRI_SLR1_18:30-20:00 (times optional). */
export function buildGroupName(identity: GroupIdentity): string {
  const day = DAY_ABBREV[identity.dayOfWeek] ?? normalizeKey(identity.dayOfWeek).slice(0, 3)
  const base = `${day}_${identity.courseToken}`
  if (!identity.startTime || !identity.endTime) return base
  return `${base}_${identity.startTime}-${identity.endTime}`
}

// ── Cell-value coercers ──────────────────────────────────────────────────────

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

type ParsedRecommendation =
  | { kind: Extract<RecommendationKind, 'COMPETITION_PREP' | 'COMPETITION_PROGRAM'> }
  | { kind: 'COURSE'; courseSlug: string }

export function parseRecommendation(value: CellValue): ParsedRecommendation | null | 'unknown' {
  const norm = normalizeKey(value)
  if (!norm) return null
  // PRIPR?EMA: the real 2025/2026 archive spells it "PRIPEMA" (missing R) in
  // places; singular/plural NATJECANJE/NATJECANJA both appear too.
  if (/^PRIPR?EMA ZA NATJECANJ[AE]$/.test(norm)) {
    return { kind: 'COMPETITION_PREP' }
  }
  if (norm === 'NATJECATELJSKI PROGRAM') return { kind: 'COMPETITION_PROGRAM' }
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

// ── Shared label-row helpers ─────────────────────────────────────────────────

/** If the row starts a `LABEL: value` line, return the value (same cell after
 *  the colon, or the next non-empty cell). `labels` are normalized keys. */
function matchLabelRow(row: CellValue[], labels: string[]): string | null {
  const firstIdx = row.findIndex((c) => cellText(c) !== '')
  if (firstIdx === -1) return null
  const first = cellText(row[firstIdx])
  const colon = first.indexOf(':')
  const head = normalizeKey(colon === -1 ? first : first.slice(0, colon))
  if (!labels.includes(head)) return null
  const inline = colon === -1 ? '' : first.slice(colon + 1).trim()
  if (inline) return inline
  const rest = row.slice(firstIdx + 1).find((c) => cellText(c) !== '')
  return rest === undefined ? '' : cellText(rest)
}

function isBlankRow(row: CellValue[]): boolean {
  return row.every((c) => cellText(c) === '')
}

/** Map normalized header captions → column index, scanning one or two rows
 *  (the evaluation sheet splits captions across a merged two-row header). */
function buildColumnMap(rows: CellValue[][], known: Record<string, string>): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    for (const [idx, cell] of row.entries()) {
      const key = known[normalizeKey(cell)]
      if (key && !map.has(key)) map.set(key, idx)
    }
  }
  return map
}

function col(row: CellValue[], map: Map<string, number>, key: string): CellValue {
  const idx = map.get(key)
  return idx === undefined ? null : (row[idx] ?? null)
}

// ── Evaluation sheet ─────────────────────────────────────────────────────────

export type EvaluationRow = {
  firstName: string
  lastName: string
  skills: Record<SkillKey, SkillLevel | null>
  opisnaOcjena: string | null
  recommendation: ParsedRecommendation | null
}

export type EvaluationBlock = {
  programLabel: string
  courseSlug: string | null
  groupLabel: string
  dayOfWeek: string | null
  teacherName: string | null
  rows: EvaluationRow[]
}

const EVALUATION_HEADERS: Record<string, string> = {
  'BR': 'br',
  'IME': 'ime',
  'PREZIME': 'prezime',
  'SLAGANJE': 'slaganje',
  'PROGRAMIRANJE': 'programiranje',
  'INOVACIJE': 'inovacije',
  'SURADNJA': 'suradnja',
  'KOMUNIKACIJA': 'komunikacija',
  'ZABAVA': 'zabava',
  'OPISNA OCJENA': 'opisnaOcjena',
  'PREPORUKA': 'preporuka',
}

const SKILL_KEYS: SkillKey[] = [
  'slaganje', 'programiranje', 'inovacije', 'suradnja', 'komunikacija', 'zabava',
]

function parseEvaluationRow(
  row: CellValue[],
  map: Map<string, number>,
  where: string,
  warnings: ImportWarning[],
): EvaluationRow {
  const firstName = titleCaseName(cellText(col(row, map, 'ime')))
  const lastName = titleCaseName(cellText(col(row, map, 'prezime')))
  const skills = {} as Record<SkillKey, SkillLevel | null>
  for (const key of SKILL_KEYS) {
    const parsed = parseSkillValue(col(row, map, key))
    if (parsed === 'unknown') {
      warnings.push({
        level: 'warn',
        where,
        message: `${firstName} ${lastName}: unrecognized ${key} value "${cellText(col(row, map, key))}" — stored as empty`,
      })
      skills[key] = null
    } else {
      skills[key] = parsed
    }
  }

  const opisna = cellText(col(row, map, 'opisnaOcjena'))
  const rawPreporuka = col(row, map, 'preporuka')
  const recommendation = parseRecommendation(rawPreporuka)
  if (recommendation === 'unknown') {
    warnings.push({
      level: 'warn',
      where,
      message: `${firstName} ${lastName}: unrecognized PREPORUKA "${cellText(rawPreporuka)}" — stored without recommendation`,
    })
  }

  return {
    firstName,
    lastName,
    skills,
    opisnaOcjena: opisna || null,
    recommendation: recommendation === 'unknown' ? null : recommendation,
  }
}

/**
 * Parses the stacked per-group evaluation blocks:
 *
 *   PROGRAM: SVIJET LEGO ROBOTIKE 1
 *   GRUPA: SRIJEDA
 *   PREDAVAČ: IVANO TABAK
 *   BR | IME | PREZIME | <6 skills across a 2-row header> | OPISNA OCJENA | PREPORUKA
 *   ...student rows until a blank row...
 */
export function parseEvaluationSheet(grid: Grid, warnings: ImportWarning[]): EvaluationBlock[] {
  const blocks: EvaluationBlock[] = []
  let current: EvaluationBlock | null = null
  let colMap: Map<string, number> | null = null
  let inTable = false

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]

    const program = matchLabelRow(row, ['PROGRAM', 'NAZIV PROGRAMA'])
    if (program !== null) {
      current = {
        programLabel: program,
        courseSlug: courseSlugFromLabel(program),
        groupLabel: '',
        dayOfWeek: null,
        teacherName: null,
        rows: [],
      }
      blocks.push(current)
      colMap = null
      inTable = false
      if (!current.courseSlug) {
        warnings.push({
          level: 'error',
          where: `evaluation block ${blocks.length}`,
          message: `Unrecognized program "${program}" — block skipped`,
        })
      }
      continue
    }
    if (!current) continue
    const where = `evaluation "${current.programLabel} / ${current.groupLabel || '?'}"`

    const grupa = matchLabelRow(row, ['GRUPA'])
    if (grupa !== null && !inTable) {
      current.groupLabel = grupa
      current.dayOfWeek = dayOfWeekFromLabel(grupa)
      if (!current.dayOfWeek) {
        warnings.push({
          level: 'error',
          where,
          message: `GRUPA "${grupa}" is not a recognizable weekday — block cannot be matched to a group`,
        })
      }
      continue
    }
    const teacher = matchLabelRow(row, ['PREDAVAC', 'TRENER'])
    if (teacher !== null && !inTable) {
      current.teacherName = teacher ? titleCaseName(teacher) : null
      continue
    }

    if (!colMap) {
      const candidate = buildColumnMap([row, grid[r + 1] ?? []], EVALUATION_HEADERS)
      if (candidate.has('ime') && candidate.has('prezime')) {
        colMap = candidate
        // Skip the second header row (skill captions) when it contributed columns.
        const nextIsHeader = (grid[r + 1] ?? []).some(
          (cell) => EVALUATION_HEADERS[normalizeKey(cell)] !== undefined,
        )
        if (nextIsHeader) r++
        inTable = true
      }
      continue
    }

    const hasName = cellText(col(row, colMap, 'ime')) || cellText(col(row, colMap, 'prezime'))
    if (!hasName) {
      // End of this block's table; anything below (legend rows…) is ignored
      // until the next PROGRAM label.
      if (inTable && !isBlankRow(row)) {
        warnings.push({ level: 'info', where, message: `Row ${r + 1} below the table ignored` })
      }
      inTable = false
      continue
    }
    if (!inTable) continue
    current.rows.push(parseEvaluationRow(row, colMap, where, warnings))
  }

  return blocks.filter((b) => {
    if (b.rows.length === 0) {
      warnings.push({
        level: 'warn',
        where: `evaluation "${b.programLabel} / ${b.groupLabel || '?'}"`,
        message: 'Block has no student rows — skipped',
      })
      return false
    }
    return true
  })
}

// ── Contact sheets (one tab per group) ───────────────────────────────────────

/**
 * Extracts a bare address from Outlook-style contact strings pasted into MAIL
 * cells: `Marija Perić <marija@outlook.com>` → `marija@outlook.com`. Also
 * strips a `mailto:` prefix and lowercases — the stored value must equal what
 * a parent later types into the inquiry form, or legacy matching breaks.
 */
function sanitizeEmail(raw: string): string {
  let email = raw.trim()
  const angled = /<([^<>]+)>/.exec(email)
  if (angled) email = angled[1].trim()
  return email.replace(/^mailto:/i, '').trim().toLowerCase()
}

const PLAIN_EMAIL = /^\S+@\S+\.\S+$/

export type ContactRow = {
  firstName: string
  lastName: string
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
  paid: boolean
}

export type ContactSheet = {
  tabName: string
  identity: GroupIdentity
  programLabel: string | null
  teacherName: string | null
  rows: ContactRow[]
}

const CONTACT_HEADERS: Record<string, string> = {
  'BR': 'br',
  'IME': 'ime',
  'PREZIME': 'prezime',
  'RODITELJ': 'roditelj',
  'MAIL': 'mail',
  'MOBITEL': 'mobitel',
  'PLACENO': 'placeno',
}

function parseContactRow(
  row: CellValue[],
  map: Map<string, number>,
  where: string,
  warnings: ImportWarning[],
): ContactRow {
  const firstName = titleCaseName(cellText(col(row, map, 'ime')))
  const lastName = titleCaseName(cellText(col(row, map, 'prezime')))

  const phoneRaw = col(row, map, 'mobitel')
  if (typeof phoneRaw === 'number') {
    warnings.push({
      level: 'info',
      where,
      message: `${firstName} ${lastName}: MOBITEL stored as number (${phoneRaw}) — leading zero may be missing`,
    })
  }

  const paidRaw = col(row, map, 'placeno')
  let paid = parsePaidValue(paidRaw)
  if (paid === 'unknown') {
    warnings.push({
      level: 'warn',
      where,
      message: `${firstName} ${lastName}: unrecognized PLAĆENO value "${cellText(paidRaw)}" — treated as unpaid`,
    })
    paid = false
  }

  const parentEmail = sanitizeEmail(cellText(col(row, map, 'mail'))) || null
  if (parentEmail && !PLAIN_EMAIL.test(parentEmail)) {
    warnings.push({
      level: 'warn',
      where,
      message: `${firstName} ${lastName}: MAIL "${cellText(col(row, map, 'mail'))}" still doesn't look like an email after cleanup — imported as-is, fix the workbook and re-run`,
    })
  }

  return {
    firstName,
    lastName,
    parentName: titleCaseName(cellText(col(row, map, 'roditelj'))) || null,
    parentEmail,
    parentPhone: cellText(phoneRaw) || null,
    paid,
  }
}

/** Parses one per-group contact tab. Returns null when the tab name does not
 *  follow the `DAY_COURSE_START-END` convention (caller decides what to do). */
export function parseContactSheet(
  tabName: string,
  grid: Grid,
  warnings: ImportWarning[],
): ContactSheet | null {
  const identity = parseGroupName(tabName)
  if (!identity) return null
  const where = `contact sheet "${tabName}"`

  const sheet: ContactSheet = {
    tabName,
    identity,
    programLabel: null,
    teacherName: null,
    rows: [],
  }

  let colMap: Map<string, number> | null = null
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    if (!colMap) {
      const program = matchLabelRow(row, ['NAZIV PROGRAMA', 'PROGRAM'])
      if (program !== null) {
        sheet.programLabel = program
        const programSlug = courseSlugFromLabel(program)
        if (programSlug && programSlug !== identity.courseSlug) {
          warnings.push({
            level: 'warn',
            where,
            message: `NAZIV PROGRAMA "${program}" disagrees with the tab name — trusting the tab name (${identity.courseToken})`,
          })
        }
        continue
      }
      const teacher = matchLabelRow(row, ['TRENER', 'PREDAVAC'])
      if (teacher !== null) {
        sheet.teacherName = teacher ? titleCaseName(teacher) : null
        continue
      }
      const candidate = buildColumnMap([row], CONTACT_HEADERS)
      if (candidate.has('ime') && candidate.has('prezime')) colMap = candidate
      continue
    }

    const hasName = cellText(col(row, colMap, 'ime')) || cellText(col(row, colMap, 'prezime'))
    if (!hasName) {
      if (sheet.rows.length > 0) break
      continue
    }
    sheet.rows.push(parseContactRow(row, colMap, where, warnings))
  }

  if (!colMap) {
    warnings.push({
      level: 'error',
      where,
      message: 'No IME/PREZIME header row found — sheet skipped',
    })
    return null
  }
  if (sheet.rows.length === 0) {
    warnings.push({ level: 'warn', where, message: 'No student rows found' })
  }
  return sheet
}
