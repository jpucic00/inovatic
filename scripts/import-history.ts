/**
 * Historical-workbook importer: reads the association's per-year Excel workbook
 * (evaluation sheet + one contact tab per group) and loads students, groups,
 * enrollments, paid marks, and report cards for one school year.
 *
 * DRY-RUN BY DEFAULT — nothing is written without --apply.
 *
 *   npm run db:import-history -- <workbook.xlsx> [--year 2025/2026] [--apply]
 *
 * Targets whatever DATABASE_URL points at (.env.local for dev; override inline
 * for prod). Idempotent: re-running only fills what a previous run left out.
 * Runbook: docs/runbooks/import-history-workbook.md
 */

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { basename } from 'node:path'

import { PrismaClient } from '@prisma/client'

import { applyImportPlan } from '../src/lib/import-history/apply'
import { type ImportWarning } from '../src/lib/import-common/grid'
import { inferSchoolYearFromFilename } from '../src/lib/import-common/values'
import { buildImportPlan, type ImportPlan } from '../src/lib/import-history/plan'
import { loadSnapshot } from '../src/lib/import-history/snapshot'
import { parseWorkbookSheets } from '../src/lib/import-history/workbook'
import { readWorkbookGrids } from '../src/lib/import-common/xlsx'

const prisma = new PrismaClient()

function parseArgs(argv: string[]): { file: string; schoolYear: string; apply: boolean } {
  const positional: string[] = []
  // Deliberately NO default: a wrong-year import silently matches the other
  // year's groups (same days/courses/times), so the year must be explicit.
  let schoolYear: string | null = null
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') apply = true
    else if (arg === '--year') schoolYear = argv[++i] ?? ''
    else if (arg.startsWith('--')) fail(`Unknown flag: ${arg}`)
    else positional.push(arg)
  }
  if (positional.length !== 1 || !schoolYear) {
    fail('Usage: npm run db:import-history -- <workbook.xlsx> --year 2024/2025 [--apply]')
  }
  if (!/^\d{4}\/\d{4}$/.test(schoolYear)) fail(`--year must look like 2024/2025 (got "${schoolYear}")`)
  return { file: positional[0], schoolYear, apply }
}

function fail(message: string): never {
  console.error(`❌ ${message}`)
  process.exit(1)
}

const LEVEL_ICON = { error: '✖', warn: '⚠', info: 'ℹ' } as const

function printWarnings(warnings: ImportWarning[]): void {
  for (const level of ['error', 'warn', 'info'] as const) {
    const items = warnings.filter((w) => w.level === level)
    if (items.length === 0) continue
    console.log(`\n${LEVEL_ICON[level]} ${level.toUpperCase()} (${items.length})`)
    for (const w of items) console.log(`   [${w.where}] ${w.message}`)
  }
}

function printPlan(plan: ImportPlan): void {
  console.log(`\n═══ Import plan — school year ${plan.schoolYear} ═══`)

  console.log(`\nGroups (${plan.groups.length}):`)
  for (const g of plan.groups) {
    const teacher = plan.teachers.find((t) => t.key === g.teacherKey)
    const enrolled = plan.enrollments.filter((e) => e.groupKey === g.key)
    const paid = enrolled.filter((e) => e.paid).length
    const graded = plan.assessments.filter((a) => a.groupKey === g.key).length
    console.log(
      `   ${g.action === 'match' ? '=' : '+'} ${g.name}  ` +
        `(${enrolled.length} students, ${paid} paid, ${graded} graded` +
        `${teacher ? `, ${teacher.firstName} ${teacher.lastName}` : ''})`,
    )
  }

  const newTeachers = plan.teachers.filter((t) => t.action === 'create')
  console.log(`\nTeachers: ${plan.teachers.length} referenced, ${newTeachers.length} to create`)
  for (const t of newTeachers) console.log(`   + ${t.firstName} ${t.lastName}  <${t.email}>`)

  const newStudents = plan.students.filter((s) => s.action === 'create')
  console.log(
    `\nStudents: ${plan.students.length} in workbook — ` +
      `${newStudents.length} to create, ${plan.students.length - newStudents.length} matched existing`,
  )
  console.log(`Enrollments: ${plan.enrollments.length} (${plan.enrollments.filter((e) => e.paid).length} paid)`)
  console.log(`Report cards: ${plan.assessments.length}`)

  printWarnings(plan.warnings)
}

async function main() {
  const { file, schoolYear, apply } = parseArgs(process.argv.slice(2))

  const filenameYear = inferSchoolYearFromFilename(basename(file))
  if (filenameYear && filenameYear !== schoolYear) {
    fail(
      `The filename suggests school year ${filenameYear} but --year is ${schoolYear}. ` +
        'Re-run with the correct --year (or rename the file if the name is misleading).',
    )
  }

  console.log(`📖 Reading ${file}…`)
  const sheets = await readWorkbookGrids(file)
  console.log(`   ${sheets.length} sheets found`)

  const warnings: ImportWarning[] = []
  const { contactSheets, evaluationBlocks } = parseWorkbookSheets(sheets, warnings)
  console.log(`   ${contactSheets.length} group tabs, ${evaluationBlocks.length} evaluation blocks`)

  const snapshot = await loadSnapshot(prisma, schoolYear).catch((err: Error) => fail(err.message))
  console.log(
    `🗄  Target DB: ${snapshot.groups.length} existing ${schoolYear} SPLIT groups, venue "${snapshot.location.name}"`,
  )

  const plan = buildImportPlan(contactSheets, evaluationBlocks, snapshot, warnings)
  printPlan(plan)

  if (!apply) {
    console.log('\n🔍 DRY-RUN — nothing written. Re-run with --apply to import.')
    return
  }

  const errors = plan.warnings.filter((w) => w.level === 'error').length
  if (errors > 0) {
    console.log(`\n⚠  Applying despite ${errors} error-level findings — the affected rows stay skipped.`)
  }
  console.log('\n✍️  Applying…')
  const result = await applyImportPlan(prisma, plan, (line) => console.log(`   ${line}`))
  console.log('\n🎉 Import complete:')
  console.log(`   Teachers created:     ${result.teachersCreated}`)
  console.log(`   Groups created:       ${result.groupsCreated}`)
  console.log(`   Assignments created:  ${result.assignmentsCreated}`)
  console.log(`   Students created:     ${result.studentsCreated} (+${result.studentsBackfilled} backfilled)`)
  console.log(`   Enrollments created:  ${result.enrollmentsCreated}`)
  console.log(`   Paid marks set:       ${result.paidMarked}`)
  console.log(`   Report cards:         ${result.assessmentsCreated} created, ${result.assessmentsUpdated} updated`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
