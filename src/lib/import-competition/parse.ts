import type { SkillLevel } from '@prisma/client'

import { skillKeysFor, type SkillKey } from '../assessment-rubric'
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
  dayOfWeekFromLabel,
  isPlainEmail,
  normalizeTimeToken,
  parseRecommendation,
  parseSkillValue,
  sanitizeEmail,
  type ParsedRecommendation,
} from '../import-common/values'

/**
 * Parsers for the natjecateljski-program archive. It is close enough to the SLR
 * workbook to share every primitive (see ../import-common) and different enough
 * in four ways to need its own sheet parsers:
 *
 *   1. Group tabs are named `DAN HHMM-HHMM` (`SUB 900-1030`) — no course token,
 *      because every group belongs to the one competition course.
 *   2. `NATJECATELJSKI PROGRAM:` means two different things: on a group tab it
 *      is the team (the group's NAME); on the izvješće sheet it is the group,
 *      spelled as a weekday. The weekday is the ONLY link between the two.
 *   3. A group has up to three staff (mentor 1, mentor 2, asistent) instead of
 *      one trener, and the block may sit above OR below the roster table.
 *   4. Group tabs carry the child's date of birth, and the rubric is the
 *      competition one (razrada ideja / izvedivost) rather than the SLR one.
 */

// ── Group tab names (`SUB 900-1030`, `PON_17-1830`, `ČET 18:30-20:00`) ───────

export type GroupSlot = {
  dayOfWeek: string
  startTime: string | null
  endTime: string | null
}

/** Day + start time is a group's identity — the tab name carries nothing else. */
export function slotKey(slot: { dayOfWeek: string; startTime: string | null }): string {
  return `${slot.dayOfWeek}|${slot.startTime ?? ''}`
}

/**
 * Parses a group tab name, or returns null when the tab is not a group tab.
 * Deliberately strict about the day token: that is what keeps the izvješće
 * sheet — and an SLR tab, should the two archives ever be merged into one
 * file — from being mistaken for a competition group.
 */
export function parseGroupTabName(name: string): GroupSlot | null {
  // Numbers → Excel export splits multi-table sheets into "SUB 900-1030 - Tablica 1".
  // Only strip a spaced-dash suffix that does NOT start with a digit, so a tab
  // spelled "SUB 900 - 1030" keeps its time range.
  const cleaned = name.replace(/\s+[-–]\s+(?!\d)\S.*$/, '').trim()
  const [dayToken, ...rest] = cleaned.split(/[\s_]+/).filter(Boolean)
  if (!dayToken) return null
  const dayOfWeek = dayOfWeekFromLabel(dayToken)
  if (!dayOfWeek) return null

  const timePart = rest.join('')
  if (!timePart) return { dayOfWeek, startTime: null, endTime: null }
  const range = /^([\d.:]+)[-–—]([\d.:]+)$/.exec(timePart)
  if (!range) return null
  const startTime = normalizeTimeToken(range[1])
  const endTime = normalizeTimeToken(range[2])
  if (!startTime || !endTime) return null
  return { dayOfWeek, startTime, endTime }
}

// ── Date of birth ────────────────────────────────────────────────────────────
// Stored as the app's `YYYY-MM-DD` string (User.dateOfBirth), which is what the
// strict returning-student match compares against.

/** Ages outside this band at the start of the school year are data entry junk
 *  (the archive holds a few 1900s), not a real child. */
const DOB_MIN_AGE = 3
const DOB_MAX_AGE = 25

type ParsedDob =
  | { status: 'empty' }
  | { status: 'ok'; iso: string }
  | { status: 'unparsable' }
  | { status: 'implausible'; iso: string }

/** Excel's day-zero (the 1900 leap-year bug included). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const ts = Date.UTC(year, month - 1, day)
  const d = new Date(ts)
  // Round-trip rejects impossible calendar dates (31.06., 29.02. in a common year).
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `12.3.2014.`, `12/03/2014`, `2014-03-12` — day-first, per the Croatian sheets. */
function isoFromString(raw: string): string | null {
  const text = raw.trim().replace(/\.$/, '')
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text)
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})$/.exec(text)
  if (dmy) return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  return null
}

export function parseDateOfBirth(value: CellValue, schoolYearStart: number): ParsedDob {
  let iso: string | null = null

  if (value instanceof Date) {
    iso = toIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  } else if (typeof value === 'number') {
    // A bare 4-digit year is a year, not a date — there is no day to store.
    if (value >= 1000 && value <= 2999) return { status: 'unparsable' }
    const d = new Date(EXCEL_EPOCH_UTC + value * MS_PER_DAY)
    iso = toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  } else {
    const text = cellText(value)
    if (!text) return { status: 'empty' }
    iso = isoFromString(text)
  }

  if (!iso) return { status: 'unparsable' }
  const year = Number(iso.slice(0, 4))
  const age = schoolYearStart - year
  if (age < DOB_MIN_AGE || age > DOB_MAX_AGE) return { status: 'implausible', iso }
  return { status: 'ok', iso }
}

// ── Parent contact cells ─────────────────────────────────────────────────────

type ParsedContact = { name: string | null; email: string | null }

/**
 * One RODITELJ / MAIL cell. Either column may hold an Outlook contact paste
 * (`Marija Perić <marija@outlook.com>`), a bare address, or a bare name — in
 * this archive the two columns are used interchangeably, sheet by sheet.
 */
export function parseContactCell(raw: string): ParsedContact {
  // Several contacts pasted into one cell: keep the first. Commas are NOT a
  // separator — Outlook writes "Perić, Marija" as one display name.
  const first = raw.split(/[;\n\r]/)[0]?.trim() ?? ''
  if (!first) return { name: null, email: null }

  const angled = /^(.*?)<([^<>]+)>\s*$/.exec(first)
  if (angled) {
    const email = sanitizeEmail(angled[2])
    return {
      name: cleanDisplayName(angled[1]),
      email: isPlainEmail(email) ? email : null,
    }
  }

  const bare = sanitizeEmail(first)
  if (isPlainEmail(bare)) return { name: null, email: bare }
  return { name: cleanDisplayName(first), email: null }
}

/** `"Perić, Marija"` → `Marija Perić`; drops quotes and collapses whitespace. */
function cleanDisplayName(raw: string): string | null {
  const text = raw.trim().replaceAll(/^["']|["']$/g, '').replaceAll(/\s+/g, ' ').trim()
  if (!text) return null
  const commaFlip = /^([^,]+),\s*(.+)$/.exec(text)
  const ordered = commaFlip ? `${commaFlip[2]} ${commaFlip[1]}` : text
  return titleCaseName(ordered) || null
}

/**
 * Resolves the pair of cells into what the app stores. The address wins from
 * MAIL when both carry one; the display name wins from RODITELJ, which is the
 * column that holds a plain name when the sheet keeps them apart.
 */
export function resolveParentContact(
  roditeljRaw: string,
  mailRaw: string,
): { parentName: string | null; parentEmail: string | null } {
  const roditelj = parseContactCell(roditeljRaw)
  const mail = parseContactCell(mailRaw)
  return {
    parentName: roditelj.name ?? mail.name,
    parentEmail: mail.email ?? roditelj.email,
  }
}

// ── Group tabs (one per group) ───────────────────────────────────────────────

export type CompetitionContactRow = {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
}

export type CompetitionGroupSheet = {
  tabName: string
  slot: GroupSlot
  /** The sheet's `NATJECATELJSKI PROGRAM:` value — becomes the group's name. */
  teamLabel: string | null
  /** Mentor 1 → mentor 2 → asistent, blanks dropped. Order is the author fallback. */
  staffNames: string[]
  rows: CompetitionContactRow[]
}

const CONTACT_HEADERS: Record<string, string> = {
  'BR': 'br', 'R BR': 'br', 'RB': 'br',
  'IME': 'ime',
  'PREZIME': 'prezime',
  // normalizeKey strips diacritics, so ROĐENJA arrives as RODENJA.
  'DATUM RODENJA': 'datumRodenja',
  'DATUM RODJENJA': 'datumRodenja',
  'DAT RODENJA': 'datumRodenja',
  'DATUM ROD': 'datumRodenja',
  'RODENJE': 'datumRodenja',
  'RODEN': 'datumRodenja',
  'RODITELJ': 'roditelj',
  'RODITELJ/SKRBNIK': 'roditelj',
  'IME RODITELJA': 'roditelj',
  'MAIL': 'mail',
  'E-MAIL': 'mail',
  'E MAIL': 'mail',
  'EMAIL': 'mail',
  'MOBITEL': 'mobitel',
  'BROJ MOBITELA': 'mobitel',
  'TELEFON': 'mobitel',
  'KONTAKT': 'mobitel',
}

/**
 * One staff cell → the people named in it.
 *
 * Two habits in the archive: a pair sharing a slot is written
 * `Ime Prezime / Ime Prezime`, and a name can trail a parenthetical note
 * (`Ime Prezime (12.03.2026.)` — when they joined or left). Without this the
 * pair becomes one impossible surname and the date lands inside another.
 */
export function parseStaffCell(raw: string): string[] {
  return raw
    .split(/[/;]/)
    .map((part) => part.replaceAll(/\([^)]*\)/g, '').replaceAll(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
}

const TEAM_LABELS = ['NATJECATELJSKI PROGRAM', 'NAZIV PROGRAMA', 'PROGRAM']
const MENTOR_1_LABELS = ['MENTOR 1', 'MENTOR1', 'MENTOR']
const MENTOR_2_LABELS = ['MENTOR 2', 'MENTOR2']
const ASSISTANT_LABELS = ['ASISTENT', 'ASISTENT 1', 'ASISTENT1', 'ASISTENTICA']

function parseGroupContactRow(
  row: CellValue[],
  map: Map<string, number>,
  schoolYearStart: number,
  where: string,
  warnings: ImportWarning[],
): CompetitionContactRow {
  const firstName = titleCaseName(cellText(col(row, map, 'ime')))
  const lastName = titleCaseName(cellText(col(row, map, 'prezime')))
  const who = `${firstName} ${lastName}`.trim()

  const dob = parseDateOfBirth(col(row, map, 'datumRodenja'), schoolYearStart)
  if (dob.status === 'unparsable') {
    warnings.push({
      level: 'warn',
      where,
      message: `${who}: date of birth "${cellText(col(row, map, 'datumRodenja'))}" could not be read — imported without a DOB`,
    })
  } else if (dob.status === 'implausible') {
    warnings.push({
      level: 'warn',
      where,
      message: `${who}: date of birth ${dob.iso} is outside ${DOB_MIN_AGE}–${DOB_MAX_AGE} years at the start of the school year — imported without a DOB`,
    })
  }

  const phoneRaw = col(row, map, 'mobitel')
  if (typeof phoneRaw === 'number') {
    warnings.push({
      level: 'info',
      where,
      message: `${who}: MOBITEL stored as number (${phoneRaw}) — leading zero may be missing`,
    })
  }

  const roditeljRaw = cellText(col(row, map, 'roditelj'))
  const mailRaw = cellText(col(row, map, 'mail'))
  const { parentName, parentEmail } = resolveParentContact(roditeljRaw, mailRaw)
  if (!parentEmail && (roditeljRaw || mailRaw)) {
    warnings.push({
      level: 'warn',
      where,
      message: `${who}: no usable e-mail found in RODITELJ/MAIL — imported without one, so returning-student matching will not find this child`,
    })
  }

  return {
    firstName,
    lastName,
    dateOfBirth: dob.status === 'ok' ? dob.iso : null,
    parentName,
    parentEmail,
    parentPhone: cellText(phoneRaw) || null,
  }
}

/**
 * Parses one group tab. Returns null when the tab name is not a group slot.
 *
 * The staff block is looked for on EVERY row rather than only above the table:
 * in the real archive it sits below the roster on some sheets. Label rows are
 * tested before roster rows precisely because of that — a `MENTOR 1:` row whose
 * value happens to land in the IME column would otherwise read as a child.
 */
export function parseGroupSheet(
  tabName: string,
  grid: Grid,
  schoolYearStart: number,
  warnings: ImportWarning[],
): CompetitionGroupSheet | null {
  const slot = parseGroupTabName(tabName)
  if (!slot) return null
  const where = `group tab "${tabName}"`

  const sheet: CompetitionGroupSheet = {
    tabName,
    slot,
    teamLabel: null,
    staffNames: [],
    rows: [],
  }
  const staff: Record<'mentor1' | 'mentor2' | 'asistent', string | null> = {
    mentor1: null, mentor2: null, asistent: null,
  }

  let colMap: Map<string, number> | null = null

  for (const row of grid) {
    const team = matchLabelRow(row, TEAM_LABELS)
    if (team !== null) {
      sheet.teamLabel ??= team.replaceAll(/\s+/g, ' ').trim() || null
      continue
    }
    const mentor1 = matchLabelRow(row, MENTOR_1_LABELS)
    if (mentor1 !== null) {
      staff.mentor1 ??= mentor1 || null
      continue
    }
    const mentor2 = matchLabelRow(row, MENTOR_2_LABELS)
    if (mentor2 !== null) {
      staff.mentor2 ??= mentor2 || null
      continue
    }
    const asistent = matchLabelRow(row, ASSISTANT_LABELS)
    if (asistent !== null) {
      staff.asistent ??= asistent || null
      continue
    }

    if (!colMap) {
      const candidate = buildColumnMap([row], CONTACT_HEADERS)
      if (candidate.has('ime') && candidate.has('prezime')) colMap = candidate
      continue
    }

    // Deliberately NO "stop at the first nameless row": these rosters are
    // pre-numbered to a fixed size, so unfilled slots sit in the middle of the
    // table as often as at the end, and stopping there silently dropped every
    // child below the gap. Label rows are already consumed above, and a group
    // tab holds nothing else, so collecting every named row is safe.
    const hasName = cellText(col(row, colMap, 'ime')) || cellText(col(row, colMap, 'prezime'))
    if (!hasName) continue
    sheet.rows.push(parseGroupContactRow(row, colMap, schoolYearStart, where, warnings))
  }

  sheet.staffNames = [staff.mentor1, staff.mentor2, staff.asistent].flatMap((n) =>
    n ? parseStaffCell(n) : [],
  )

  if (!colMap) {
    warnings.push({ level: 'error', where, message: 'No IME/PREZIME header row found — tab skipped' })
    return null
  }
  if (!sheet.teamLabel) {
    warnings.push({
      level: 'warn',
      where,
      message: 'No "NATJECATELJSKI PROGRAM:" row — the group will be named after its weekday instead',
    })
  }
  if (sheet.staffNames.length === 0) {
    warnings.push({
      level: 'warn',
      where,
      message: 'No MENTOR/ASISTENT rows — nobody will be assigned to this group and its report cards cannot be authored',
    })
  }
  if (sheet.rows.length === 0) {
    warnings.push({ level: 'warn', where, message: 'No student rows found' })
  }
  if (!slot.startTime) {
    warnings.push({
      level: 'warn',
      where,
      message: 'Tab name carries no time range — the group is matched on its weekday alone',
    })
  }
  return sheet
}

// ── Evaluation sheet (IZVJEŠĆE) ──────────────────────────────────────────────

export type CompetitionEvaluationRow = {
  firstName: string
  lastName: string
  skills: Record<SkillKey, SkillLevel | null>
  opisnaOcjena: string | null
  recommendation: ParsedRecommendation | null
}

export type CompetitionEvaluationBlock = {
  groupLabel: string
  dayOfWeek: string | null
  staffNames: string[]
  rows: CompetitionEvaluationRow[]
}

const EVALUATION_HEADERS: Record<string, string> = {
  'BR': 'br', 'R BR': 'br', 'RB': 'br',
  'IME': 'ime',
  'PREZIME': 'prezime',
  'RAZRADA IDEJA': 'razradaIdeja',
  'RAZRADA IDEJE': 'razradaIdeja',
  'RAZRADA': 'razradaIdeja',
  'IZVEDIVOST': 'izvedivost',
  'IZVEDBA': 'izvedivost',
  'INOVACIJE': 'inovacije',
  'SURADNJA': 'suradnja',
  'KOMUNIKACIJA': 'komunikacija',
  'ZABAVA': 'zabava',
  // The competition sheet calls the free-text column POVRATNA INFORMACIJA; the
  // SLR one calls the same thing OPISNA OCJENA. Both land in `opisnaOcjena`.
  'POVRATNA INFORMACIJA': 'opisnaOcjena',
  'OPISNA OCJENA': 'opisnaOcjena',
  'PREPORUKA': 'preporuka',
}

/** The rubric this sheet grades — read from the rubric module so the importer
 *  cannot drift from what `upsertStudentAssessment` is willing to store. */
const COMPETITION_SKILL_KEYS = skillKeysFor('COMPETITION')

/**
 * Every caption either header can hold. The inspector uses it to tell a real
 * header row from a row of children's names before printing anything verbatim —
 * a name row contains none of these.
 */
export const KNOWN_CAPTIONS: ReadonlySet<string> = new Set([
  ...Object.keys(CONTACT_HEADERS),
  ...Object.keys(EVALUATION_HEADERS),
])

const STAFF_LABELS = [
  ...MENTOR_1_LABELS, ...MENTOR_2_LABELS, ...ASSISTANT_LABELS, 'PREDAVAC', 'TRENER',
]

function parseEvaluationRow(
  row: CellValue[],
  map: Map<string, number>,
  where: string,
  warnings: ImportWarning[],
): CompetitionEvaluationRow {
  const firstName = titleCaseName(cellText(col(row, map, 'ime')))
  const lastName = titleCaseName(cellText(col(row, map, 'prezime')))
  const who = `${firstName} ${lastName}`.trim()

  const skills = {} as Record<SkillKey, SkillLevel | null>
  for (const key of COMPETITION_SKILL_KEYS) {
    const parsed = parseSkillValue(col(row, map, key))
    if (parsed === 'unknown') {
      warnings.push({
        level: 'warn',
        where,
        message: `${who}: unrecognized ${key} value "${cellText(col(row, map, key))}" — stored as empty`,
      })
      skills[key] = null
    } else {
      skills[key] = parsed
    }
  }

  const rawPreporuka = col(row, map, 'preporuka')
  const recommendation = parseRecommendation(rawPreporuka)
  if (recommendation === 'unknown') {
    warnings.push({
      level: 'warn',
      where,
      message: `${who}: unrecognized PREPORUKA "${cellText(rawPreporuka)}" — stored without recommendation`,
    })
  }

  return {
    firstName,
    lastName,
    skills,
    opisnaOcjena: cellText(col(row, map, 'opisnaOcjena')) || null,
    recommendation: recommendation === 'unknown' ? null : recommendation,
  }
}

/**
 * Parses the stacked per-group blocks of the izvješće sheet:
 *
 *   NATJECATELJSKI PROGRAM: PONEDJELJAK      ← the group IS the weekday
 *   MENTOR 1: …                              (optional)
 *   BR | IME | PREZIME | <6 skills> | OPISNA OCJENA | PREPORUKA
 *   …student rows until a blank row…
 *
 * A `PROGRAM:` + `GRUPA:` pair (the SLR spelling) is accepted too, so the same
 * parser still works if the archive is ever normalized to one layout.
 */
export function parseCompetitionEvaluationSheet(
  grid: Grid,
  warnings: ImportWarning[],
): CompetitionEvaluationBlock[] {
  const blocks: CompetitionEvaluationBlock[] = []
  let current: CompetitionEvaluationBlock | null = null
  let colMap: Map<string, number> | null = null
  let inTable = false

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]

    const header = matchLabelRow(row, TEAM_LABELS)
    if (header !== null) {
      // On this sheet the label's value is the group (a weekday). When it is
      // not, it is the program title and the group arrives on a `GRUPA:` row.
      const label = dayOfWeekFromLabel(header) ? header : ''
      current = {
        groupLabel: label,
        dayOfWeek: dayOfWeekFromLabel(label),
        staffNames: [],
        rows: [],
      }
      blocks.push(current)
      colMap = null
      inTable = false
      continue
    }
    if (!current) continue
    const where = `evaluation block "${current.groupLabel || '?'}"`

    const grupa = matchLabelRow(row, ['GRUPA'])
    if (grupa !== null && !inTable) {
      current.groupLabel = grupa
      current.dayOfWeek = dayOfWeekFromLabel(grupa)
      continue
    }
    const staff = matchLabelRow(row, STAFF_LABELS)
    if (staff !== null && !inTable) {
      current.staffNames.push(...parseStaffCell(staff))
      continue
    }

    if (!colMap) {
      const next = grid[r + 1] ?? []
      const candidate = buildColumnMap([row, next], EVALUATION_HEADERS)
      if (candidate.has('ime') && candidate.has('prezime')) {
        colMap = candidate
        // The header may be merged across two rows, the second holding the skill
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
    const where = `evaluation block "${b.groupLabel || '?'}"`
    if (b.rows.length === 0) {
      warnings.push({ level: 'warn', where, message: 'Block has no student rows — skipped' })
      return false
    }
    if (!b.dayOfWeek) {
      warnings.push({
        level: 'error',
        where,
        message: `"${b.groupLabel}" is not a recognizable weekday — block cannot be matched to a group`,
      })
    }
    return true
  })
}
