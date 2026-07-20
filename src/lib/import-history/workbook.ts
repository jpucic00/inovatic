import {
  parseContactSheet,
  parseEvaluationSheet,
  type ContactSheet,
  type EvaluationBlock,
  type Grid,
  type ImportWarning,
} from './parse'

type ParsedWorkbook = {
  contactSheets: ContactSheet[]
  evaluationBlocks: EvaluationBlock[]
}

/**
 * Classifies workbook sheets: tabs named by the group convention become
 * contact sheets, sheets containing PROGRAM blocks become evaluation blocks,
 * anything else is reported and ignored.
 */
export function parseWorkbookSheets(
  sheets: { name: string; grid: Grid }[],
  warnings: ImportWarning[],
): ParsedWorkbook {
  const contactSheets: ContactSheet[] = []
  let evaluationBlocks: EvaluationBlock[] = []

  for (const sheet of sheets) {
    const contact = parseContactSheet(sheet.name, sheet.grid, warnings)
    if (contact) {
      contactSheets.push(contact)
      continue
    }
    const blocks = parseEvaluationSheet(sheet.grid, warnings)
    if (blocks.length > 0) {
      if (evaluationBlocks.length > 0) {
        warnings.push({
          level: 'warn',
          where: `sheet "${sheet.name}"`,
          message: 'Second sheet with evaluation blocks — merging with the first',
        })
      }
      evaluationBlocks = [...evaluationBlocks, ...blocks]
    } else {
      warnings.push({
        level: 'info',
        where: `sheet "${sheet.name}"`,
        message: 'Not a group tab and no evaluation blocks — ignored',
      })
    }
  }

  return { contactSheets, evaluationBlocks }
}
