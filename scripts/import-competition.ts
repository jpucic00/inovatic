/**
 * Natjecateljski-program workbook importer: reads the competition archive
 * (izvješće sheet + one tab per group) and loads students, groups, staff
 * assignments, enrollments with their paid monthly fees, and report cards for
 * one school year.
 *
 * DRY-RUN BY DEFAULT — nothing is written without --apply.
 *
 *   npm run db:import-competition -- <workbook.xlsx> --year 2025/2026 [--city SPLIT] [--apply]
 *   npm run db:import-competition -- <workbook.xlsx> --inspect
 *
 * Targets whatever DATABASE_URL points at (.env.local for dev; override inline
 * for prod). Idempotent: re-running only fills what a previous run left out.
 * Runbook: docs/runbooks/import-competition-workbook.md
 */

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { basename } from 'node:path'

import { PrismaClient, type City } from '@prisma/client'

import type { ImportWarning } from '../src/lib/import-common/grid'
import { inferSchoolYearFromFilename } from '../src/lib/import-common/values'
import { readWorkbookGrids } from '../src/lib/import-common/xlsx'
import { applyCompetitionPlan } from '../src/lib/import-competition/apply'
import { inspectCompetitionWorkbook } from '../src/lib/import-competition/inspect'
import { buildCompetitionPlan, type CompetitionPlan } from '../src/lib/import-competition/plan'
import { loadCompetitionSnapshot } from '../src/lib/import-competition/snapshot'
import { parseCompetitionWorkbook } from '../src/lib/import-competition/workbook'

const prisma = new PrismaClient()

const CITIES: City[] = ['SPLIT', 'SIBENIK']

type Args = { file: string; schoolYear: string; city: City; apply: boolean; inspect: boolean }

function fail(message: string): never {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  // Deliberately NO default year: a wrong-year import silently matches the
  // other year's groups (same days and times), which on apply would attach
  // enrollments and report cards to the wrong school year.
  let schoolYear: string | null = null
  let city: City = 'SPLIT'
  let apply = false
  let inspect = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') apply = true
    else if (arg === '--inspect') inspect = true
    else if (arg === '--year') schoolYear = argv[++i] ?? ''
    else if (arg === '--city') {
      const value = (argv[++i] ?? '').toUpperCase()
      if (!CITIES.includes(value as City)) fail(`--city must be one of ${CITIES.join(' | ')}`)
      city = value as City
    } else if (arg.startsWith('--')) fail(`Unknown flag: ${arg}`)
    else positional.push(arg)
  }
  if (positional.length !== 1) {
    fail('Usage: npm run db:import-competition -- <workbook.xlsx> --year 2025/2026 [--city SPLIT] [--apply]')
  }
  // --inspect never touches the DB, so it needs no year.
  if (!inspect) {
    if (!schoolYear) fail('--year is required (e.g. --year 2025/2026)')
    if (!/^\d{4}\/\d{4}$/.test(schoolYear)) {
      fail(`--year must look like 2025/2026 (got "${schoolYear}")`)
    }
  }
  return { file: positional[0], schoolYear: schoolYear ?? '', city, apply, inspect }
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

function printPlan(plan: CompetitionPlan): void {
  console.log(`\n═══ Import plan — natjecateljski program, ${plan.schoolYear}, ${plan.city} ═══`)

  console.log(`\nGroups (${plan.groups.length}):`)
  for (const g of plan.groups) {
    const staff = g.teacherKeys
      .map((k) => plan.teachers.find((t) => t.key === k))
      .filter((t) => t !== undefined)
      .map((t) => `${t.firstName} ${t.lastName}`)
    const enrolled = plan.enrollments.filter((e) => e.groupKey === g.key).length
    const graded = plan.assessments.filter((a) => a.groupKey === g.key).length
    console.log(
      `   ${g.action === 'match' ? '=' : '+'} ${g.name}  ` +
        `[${g.slot.dayOfWeek} ${g.slot.startTime ?? '?'}–${g.slot.endTime ?? '?'}, tab "${g.tabName}"]  ` +
        `(${enrolled} students, ${graded} graded${staff.length > 0 ? `, ${staff.join(' + ')}` : ''})`,
    )
  }

  const newStaff = plan.teachers.filter((t) => t.action === 'create')
  console.log(`\nStaff: ${plan.teachers.length} referenced, ${newStaff.length} to create`)
  for (const t of newStaff) {
    if (t.action === 'create') console.log(`   + ${t.firstName} ${t.lastName}  <${t.email}>`)
  }

  const newStudents = plan.students.filter((s) => s.action === 'create')
  const withDob = plan.students.filter((s) => s.dateOfBirth !== null).length
  const withEmail = plan.students.filter((s) => s.parentEmail !== null).length
  console.log(
    `\nStudents: ${plan.students.length} in workbook — ` +
      `${newStudents.length} to create, ${plan.students.length - newStudents.length} matched existing`,
  )
  console.log(`   with a usable date of birth: ${withDob}/${plan.students.length}`)
  console.log(`   with a parent e-mail:        ${withEmail}/${plan.students.length}`)

  const months = plan.seasonMonths
  console.log(`\nEnrollments: ${plan.enrollments.length}`)
  console.log(
    months.length === 0
      ? '   Monthly fees: none — no season planned for this year/city'
      : `   Monthly fees: ${months.length} months per enrollment ` +
          `(${months[0].toISOString().slice(0, 7)} … ${months.at(-1)?.toISOString().slice(0, 7)}), all marked paid`,
  )
  console.log(`Report cards: ${plan.assessments.length}`)

  printWarnings(plan.warnings)
}

async function main() {
  const { file, schoolYear, city, apply, inspect } = parseArgs(process.argv.slice(2))

  console.log(`📖 Reading ${file}…`)
  const sheets = await readWorkbookGrids(file)
  console.log(`   ${sheets.length} sheets found`)

  if (inspect) {
    console.log(
      '\n🔒 Structure only — no cell VALUES are printed, so this output is safe to share.\n' +
        '   Printed verbatim: sheet names, row labels (the text before a colon) and\n' +
        '   column captions this importer already recognizes. Everything else is a\n' +
        '   masked shape: letters → A{n}, digits → 9{n}, long free text summarized.',
    )
    for (const line of inspectCompetitionWorkbook(sheets)) console.log(line)
    return
  }

  const filenameYear = inferSchoolYearFromFilename(basename(file))
  if (filenameYear && filenameYear !== schoolYear) {
    fail(
      `The filename suggests school year ${filenameYear} but --year is ${schoolYear}. ` +
        'Re-run with the correct --year (or rename the file if the name is misleading).',
    )
  }

  const warnings: ImportWarning[] = []
  const schoolYearStart = Number(schoolYear.slice(0, 4))
  const { groupSheets, evaluationBlocks } = parseCompetitionWorkbook(sheets, schoolYearStart, warnings)
  console.log(`   ${groupSheets.length} group tabs, ${evaluationBlocks.length} evaluation blocks`)
  if (groupSheets.length === 0) {
    console.log(
      '\n⚠  No sheet was recognized as a group tab. Group tabs must be named like ' +
        '"SUB 900-1030" (weekday + time range). Run with --inspect to see how each sheet was read.',
    )
  }

  const snapshot = await loadCompetitionSnapshot(prisma, schoolYear, city).catch((err: Error) =>
    fail(err.message),
  )
  console.log(
    `🗄  Target DB: ${snapshot.groups.length} existing ${schoolYear} ${city} competition groups, ` +
      `venue "${snapshot.location.name}"`,
  )
  if (snapshot.season) {
    console.log(
      `   Season: ${snapshot.season.startDate?.toISOString().slice(0, 10) ?? '?'} → ` +
        `${snapshot.season.endDate?.toISOString().slice(0, 10) ?? '?'}`,
    )
  }

  const plan = buildCompetitionPlan(groupSheets, evaluationBlocks, snapshot, warnings)
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
  const result = await applyCompetitionPlan(prisma, plan, (line) => console.log(`   ${line}`))
  console.log('\n🎉 Import complete:')
  console.log(`   Staff created:        ${result.teachersCreated}`)
  console.log(`   Groups created:       ${result.groupsCreated}`)
  console.log(`   Assignments created:  ${result.assignmentsCreated}`)
  console.log(`   Students created:     ${result.studentsCreated} (+${result.studentsBackfilled} backfilled)`)
  console.log(`   Enrollments created:  ${result.enrollmentsCreated}`)
  console.log(`   Months written:       ${result.monthsCreated} (${result.monthsMarkedPaid} marked paid)`)
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
