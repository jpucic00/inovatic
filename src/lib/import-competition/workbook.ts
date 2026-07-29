import type { Grid, ImportWarning } from '../import-common/grid'
import {
  parseCompetitionEvaluationSheet,
  parseGroupSheet,
  type CompetitionEvaluationBlock,
  type CompetitionGroupSheet,
} from './parse'

type ParsedWorkbook = {
  groupSheets: CompetitionGroupSheet[]
  evaluationBlocks: CompetitionEvaluationBlock[]
}

/**
 * Classifies workbook sheets: tabs named `DAN HHMM-HHMM` become group tabs,
 * sheets holding evaluation blocks become the izvješće, anything else is
 * reported and ignored. Mirrors the SLR importer's classifier — the sheet
 * conventions differ, the "nothing fails on an extra sheet" rule does not.
 */
export function parseCompetitionWorkbook(
  sheets: { name: string; grid: Grid }[],
  schoolYearStart: number,
  warnings: ImportWarning[],
): ParsedWorkbook {
  const groupSheets: CompetitionGroupSheet[] = []
  let evaluationBlocks: CompetitionEvaluationBlock[] = []

  for (const sheet of sheets) {
    const group = parseGroupSheet(sheet.name, sheet.grid, schoolYearStart, warnings)
    if (group) {
      groupSheets.push(group)
      continue
    }
    const blocks = parseCompetitionEvaluationSheet(sheet.grid, warnings)
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

  return { groupSheets, evaluationBlocks }
}
