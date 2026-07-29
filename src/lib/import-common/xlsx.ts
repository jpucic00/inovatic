import ExcelJS from 'exceljs'

import type { CellValue, Grid } from './grid'

type SheetGrid = { name: string; grid: Grid }

/** Flattens an exceljs cell value (rich text, hyperlinks, formula results…)
 *  into the plain primitive the parsers work with. */
function flattenCellValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('')
    if ('hyperlink' in value) return typeof value.text === 'string' ? value.text : value.hyperlink
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as ExcelJS.CellFormulaValue).result
      if (result === null || result === undefined) return null
      if (result instanceof Date) return result
      if (typeof result === 'object') return null // { error: … }
      return result
    }
    if ('error' in value) return null
  }
  return String(value)
}

function worksheetToGrid(ws: ExcelJS.Worksheet): Grid {
  const grid: Grid = []
  const columnCount = ws.columnCount
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: CellValue[] = []
    for (let c = 1; c <= columnCount; c++) {
      // Merged children resolve to their master's value, which is exactly what
      // the two-row evaluation header needs.
      cells.push(flattenCellValue(row.getCell(c).value))
    }
    grid.push(cells)
  }
  return grid
}

export async function readWorkbookGrids(source: string | Buffer): Promise<SheetGrid[]> {
  const workbook = new ExcelJS.Workbook()
  if (typeof source === 'string') {
    await workbook.xlsx.readFile(source)
  } else {
    await workbook.xlsx.load(source as unknown as ExcelJS.Buffer)
  }
  return workbook.worksheets.map((ws) => ({ name: ws.name, grid: worksheetToGrid(ws) }))
}
