// Shared grid model for the historical-workbook importers. Sheets arrive as
// plain 2-D value grids (row-major, 0-based) so every parser stays pure and
// unit-testable without touching an .xlsx reader.

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
export function normalizeKey(value: CellValue): string {
  if (value === null || value === undefined) return ''
  return stripDiacritics(String(value))
    .toUpperCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')
    .trim()
}

export function cellText(value: CellValue): string {
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

// ── Shared label-row helpers ─────────────────────────────────────────────────

/** If the row starts a `LABEL: value` line, return the value (same cell after
 *  the colon, or the next non-empty cell). `labels` are normalized keys. */
export function matchLabelRow(row: CellValue[], labels: string[]): string | null {
  const firstIdx = row.findIndex((c) => cellText(c) !== '')
  if (firstIdx === -1) return null
  const first = cellText(row[firstIdx])
  const colon = first.indexOf(':')
  const head = normalizeKey(colon === -1 ? first : first.slice(0, colon))
  if (!labels.includes(head)) return null
  const inline = colon === -1 ? '' : first.slice(colon + 1).trim()
  if (inline) return inline
  const rest = row.slice(firstIdx + 1).find((c) => cellText(c) !== '')
  if (rest === undefined) return ''
  // Label cells are often merged across several columns, and the xlsx adapter
  // resolves every merged child to the master's value — so an EMPTY label reads
  // its own caption back as the "value". Left unguarded, an unfilled
  // `MENTOR 2:` row creates a teacher called "Mentor 2".
  const value = cellText(rest)
  return value === first || normalizeKey(value) === head ? '' : value
}

export function isBlankRow(row: CellValue[]): boolean {
  return row.every((c) => cellText(c) === '')
}

/**
 * Header captions carry trailing punctuation inconsistently across the
 * archives — `IME:`, `BR.`, `DATUM ROD.` — and none of it is meaningful, so it
 * is stripped before lookup. (`normalizeKey` alone drops only a colon, which
 * silently cost the whole `DATUM ROD.` column on the competition tabs.)
 */
function captionKey(cell: CellValue): string {
  return normalizeKey(cell).replace(/[.:]+$/, '').trim()
}

/** Map normalized header captions → column index, scanning one or two rows
 *  (the evaluation sheet splits captions across a merged two-row header). */
export function buildColumnMap(
  rows: CellValue[][],
  known: Record<string, string>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    for (const [idx, cell] of row.entries()) {
      const key = known[captionKey(cell)]
      if (key && !map.has(key)) map.set(key, idx)
    }
  }
  return map
}

export function col(row: CellValue[], map: Map<string, number>, key: string): CellValue {
  const idx = map.get(key)
  return idx === undefined ? null : (row[idx] ?? null)
}
