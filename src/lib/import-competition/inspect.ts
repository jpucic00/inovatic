import { cellText, isBlankRow, normalizeKey, type CellValue, type Grid } from '../import-common/grid'
import { KNOWN_CAPTIONS, KNOWN_LABEL_HEADS, parseGroupTabName } from './parse'

/**
 * Structure-only report for a workbook that cannot be shared.
 *
 * The archive holds children's names, dates of birth, parents' e-mail addresses
 * and phone numbers, so no cell VALUE is ever printed. What is printed is the
 * scaffolding a parser needs to be debugged against: sheet names, which rows
 * look like `LABEL:` lines, the header captions (captions are vocabulary, not
 * data), which captions this importer did and did not recognize, and the
 * *shape* of the values in each column — `9{2}.9{2}.9{4}.` tells you the date
 * format without telling you anyone's birthday.
 */

/** `12.03.2014.` → `9{2}.9{2}.9{4}.`; `Ana Perić` → `A{3} A{5}`. */
export function maskShape(text: string): string {
  const runs = text.matchAll(/(\p{L}+)|(\d+)|(\s+)|(.)/gu)
  let out = ''
  for (const run of runs) {
    if (run[1]) out += `A{${run[1].length}}`
    else if (run[2]) out += `9{${run[2].length}}`
    else if (run[3]) out += ' '
    else out += run[4]
  }
  return out
}

/** Long free text (opisna ocjena) is summarized rather than masked. */
function describeValue(value: CellValue): string {
  if (value === null || value === undefined) return '(empty)'
  if (value instanceof Date) return '(Date cell)'
  if (typeof value === 'boolean') return '(boolean)'
  if (typeof value === 'number') return `(number, ${String(value).length} digits)`
  const text = value.trim()
  if (!text) return '(empty)'
  if (text.length > 60) return `(text, ${text.length} chars)`
  return maskShape(text)
}

function summarizeColumn(values: CellValue[]): string {
  const counts = new Map<string, number>()
  for (const v of values) {
    const shape = describeValue(v)
    counts.set(shape, (counts.get(shape) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([shape, n]) => `${shape} ×${n}`)
    .join(', ')
}

/** A row that reads as `SOMETHING:` — captions and label lines both match. */
function labelOf(row: CellValue[]): string | null {
  const firstIdx = row.findIndex((c) => cellText(c) !== '')
  if (firstIdx === -1) return null
  const first = cellText(row[firstIdx])
  const colon = first.indexOf(':')
  if (colon === -1) return null
  const head = normalizeKey(first.slice(0, colon))
  if (!head || head.length > 40) return null
  // Only heads the importer already knows are quoted: any free-text cell that
  // happens to contain a colon ("Ana Perić: ispisana 3. mj.") would otherwise
  // print a child's name into output that is declared safe to share.
  const shownHead = KNOWN_LABEL_HEADS.has(head) ? head : maskShape(head)
  const inline = first.slice(colon + 1).trim()
  const rest = row.slice(firstIdx + 1).find((c) => cellText(c) !== '')
  const value = inline || (rest === undefined ? '' : cellText(rest))
  return `${shownHead}: ${value ? describeValue(value) : '(empty)'}`
}

/**
 * A row of 3+ short text cells reads as a header candidate — but so does a row
 * of children's names, and header captions are the one thing printed verbatim.
 * `recognized` is therefore the gate on printing: a row is only quoted when it
 * carries at least one caption this importer already knows, which a row of
 * names never does. Candidates with none are reported by shape alone, so an
 * entirely unfamiliar vocabulary is still visible without leaking anything.
 */
function classifyRow(row: CellValue[]): 'recognized' | 'candidate' | null {
  const filled = row.filter((c) => cellText(c) !== '')
  if (filled.length < 3) return null
  // Date cells are data by definition (a DOB), never captions — treat them
  // like numbers so a roster row with a Date can't read as a header.
  if (!filled.every((c) => cellText(c).length <= 30 && typeof c !== 'number' && !(c instanceof Date)))
    return null
  return filled.some((c) => KNOWN_CAPTIONS.has(normalizeKey(c))) ? 'recognized' : 'candidate'
}

export function inspectCompetitionWorkbook(sheets: { name: string; grid: Grid }[]): string[] {
  const lines: string[] = []

  for (const sheet of sheets) {
    const slot = parseGroupTabName(sheet.name)
    const rows = sheet.grid.filter((r) => !isBlankRow(r))
    lines.push(
      '',
      `━━ sheet "${sheet.name}"  (${rows.length} non-empty rows)`,
      slot
        ? `   reads as a GROUP TAB → ${slot.dayOfWeek} ${slot.startTime ?? '?'}–${slot.endTime ?? '?'}`
        : '   does NOT read as a group tab → treated as the izvješće sheet',
    )

    const labels: string[] = []
    const headers: { index: number; captions: string[]; recognized: boolean }[] = []
    for (const [idx, row] of sheet.grid.entries()) {
      if (isBlankRow(row)) continue
      const label = labelOf(row)
      if (label) {
        labels.push(`   row ${idx + 1}  ${label}`)
        continue
      }
      const kind = classifyRow(row)
      if (!kind) continue
      const cells = row.filter((c) => cellText(c) !== '')
      headers.push({
        index: idx + 1,
        recognized: kind === 'recognized',
        // Even on a recognized row, only captions the importer already knows
        // are quoted. Caption vocabulary overlaps value vocabulary —
        // 'Inovacije' is both a rubric caption and a preporuka value — so a
        // data row with one caption-word must not print its other cells
        // (names, dates) verbatim. Unknown captions still surface as shapes.
        captions: cells.map((c) =>
          kind === 'recognized' && KNOWN_CAPTIONS.has(normalizeKey(c))
            ? normalizeKey(c)
            : describeValue(c),
        ),
      })
    }

    if (labels.length > 0) {
      lines.push('   label rows:', ...labels.slice(0, 60))
    } else {
      lines.push('   label rows: none found')
    }

    if (headers.length === 0) {
      lines.push('   header-like rows: none found')
    } else {
      lines.push('   header-like rows (recognized captions are quoted; unrecognized rows show shapes only):')
      for (const h of headers.slice(0, 6)) {
        lines.push(`   row ${h.index}${h.recognized ? '' : ' (no known caption)'}: ${h.captions.join(' | ')}`)
      }
      // Column shapes below the first header row we could actually read.
      const first = headers.find((h) => h.recognized) ?? headers[0]
      const headerRow = sheet.grid[first.index - 1] ?? []
      const body = sheet.grid.slice(first.index).filter((r) => !isBlankRow(r))
      if (body.length > 0) {
        const width = Math.max(...body.map((r) => r.length))
        lines.push(`   value shapes below row ${first.index} (${body.length} rows):`)
        for (let c = 0; c < width; c++) {
          const values = body.map((r) => r[c] ?? null)
          if (values.every((v) => cellText(v) === '')) continue
          const raw = normalizeKey(headerRow[c] ?? '')
          const caption = KNOWN_CAPTIONS.has(raw) ? raw : `col ${c + 1}`
          lines.push(`     ${caption}: ${summarizeColumn(values)}`)
        }
      }
    }
  }

  return lines
}
