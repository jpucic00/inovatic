import type { SkillLevel } from '@prisma/client'

import {
  buildColumnMap,
  cellText,
  col,
  isBlankRow,
  matchLabelRow,
  normalizeKey,
  titleCaseName,
  type CellValue,
  type Grid,
  type ImportWarning,
} from '../import-common/grid'
import {
  courseSlugFromLabel,
  dayOfWeekFromLabel,
  isPlainEmail,
  normalizeTimeToken,
  parsePaidValue,
  parseRecommendation,
  parseSkillValue,
  sanitizeEmail,
  type ParsedRecommendation,
} from '../import-common/values'
import type { SkillKey } from '../assessment-rubric'

/** App dayOfWeek → prod group-name abbreviation (SRI). */
const DAY_ABBREV: Record<string, string> = {
  Ponedjeljak: 'PON', Utorak: 'UTO', Srijeda: 'SRI', Četvrtak: 'ČET',
  Petak: 'PET', Subota: 'SUB', Nedjelja: 'NED',
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
      const next = grid[r + 1] ?? []
      const candidate = buildColumnMap([row, next], EVALUATION_HEADERS)
      if (candidate.has('ime') && candidate.has('prezime')) {
        colMap = candidate
        // The header is merged across two rows, the second holding the skill
        // captions. Its name cells are either blank or — where the merge is
        // vertical, so the master value repeats downward — the captions again.
        // Testing THOSE cells rather than "the row contains a caption word" is
        // what keeps a child whose PREPORUKA reads "Inovacije" from being
        // mistaken for a header row and silently dropped.
        const isCaptionCell = (cell: CellValue): boolean =>
          cellText(cell) === '' || EVALUATION_HEADERS[normalizeKey(cell)] !== undefined
        const nextIsHeader =
          next.some((cell) => EVALUATION_HEADERS[normalizeKey(cell)] !== undefined) &&
          isCaptionCell(col(next, candidate, 'ime')) &&
          isCaptionCell(col(next, candidate, 'prezime'))
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
  if (parentEmail && !isPlainEmail(parentEmail)) {
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
  for (const row of grid) {
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
