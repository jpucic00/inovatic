import { describe, expect, it } from 'vitest'

import type { Grid, ImportWarning } from '@/lib/import-common/grid'
import {
  parseContactSheet,
  parseEvaluationSheet,
  type ContactSheet,
  type EvaluationBlock,
} from '@/lib/import-history/parse'
import { buildImportPlan, type DbSnapshot } from '@/lib/import-history/plan'

const SLR1 = { id: 'course-1', slug: 'slr-1' }
const SLR2 = { id: 'course-2', slug: 'slr-2' }

function snapshot(overrides: Partial<DbSnapshot> = {}): DbSnapshot {
  return {
    schoolYear: '2025/2026',
    location: { id: 'loc-1', name: 'Velebitska 32' },
    courses: [SLR1, SLR2],
    groups: [],
    staff: [],
    students: [],
    usernames: [],
    emails: [],
    ...overrides,
  }
}

function contactSheet(
  tabName: string,
  teacher: string | null,
  rows: [string, string, boolean][],
  warnings: ImportWarning[],
): ContactSheet {
  const grid: Grid = [
    teacher ? [`TRENER: ${teacher}`] : ['ASISTENT:'],
    ['BR.', 'IME:', 'PREZIME:', 'RODITELJ:', 'MAIL:', 'MOBITEL:', 'PLAĆENO'],
    ...rows.map(([first, last, paid], i): Grid[number] => [
      i + 1, first, last, `RODITELJ ${last}`, `parent.${i}.${tabName.toLowerCase()}@example.com`, '0910000000', paid,
    ]),
  ]
  const sheet = parseContactSheet(tabName, grid, warnings)
  if (!sheet) throw new Error(`fixture tab name did not parse: ${tabName}`)
  return sheet
}

function evaluationBlocks(
  program: string,
  day: string,
  teacher: string,
  rows: [string, string][],
  warnings: ImportWarning[],
): EvaluationBlock[] {
  const grid: Grid = [
    [`PROGRAM: ${program}`],
    [`GRUPA: ${day}`],
    [`PREDAVAČ: ${teacher}`],
    ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
    ...rows.map(([first, last], i): Grid[number] => [
      i + 1, first, last, 'Ostvareno', 'U razvoju', null, null, null, null, 'Komentar.', null,
    ]),
  ]
  return parseEvaluationSheet(grid, warnings)
}

describe('buildImportPlan — groups', () => {
  it('creates a group when nothing matches, reusing the prod naming convention', () => {
    const warnings: ImportWarning[] = []
    const sheets = [contactSheet('SRI_SLR1_1830-20', 'IVANO TABAK', [['IVA', 'IVIĆ', true]], warnings)]
    const plan = buildImportPlan(sheets, [], snapshot(), warnings)

    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({
      action: 'create',
      name: 'SRI_SLR1_18:30-20:00',
      courseId: SLR1.id,
    })
    expect(plan.teachers).toHaveLength(1)
    expect(plan.teachers[0]).toMatchObject({ action: 'create', firstName: 'Ivano', lastName: 'Tabak' })
  })

  it('matches an existing prod group despite the different time spelling', () => {
    const warnings: ImportWarning[] = []
    const sheets = [contactSheet('SRI_SLR1_1830-20', null, [['IVA', 'IVIĆ', false]], warnings)]
    const plan = buildImportPlan(
      sheets,
      [],
      snapshot({ groups: [{ id: 'g-existing', name: 'SRI_SLR1_18:30-20:00' }] }),
      warnings,
    )
    expect(plan.groups[0]).toMatchObject({ action: 'match', existingId: 'g-existing' })
  })

  it('creates a separate group (with a warning) when course+day matches but the time differs', () => {
    const warnings: ImportWarning[] = []
    const sheets = [contactSheet('SRI_SLR1_1830-20', null, [['IVA', 'IVIĆ', false]], warnings)]
    const plan = buildImportPlan(
      sheets,
      [],
      snapshot({ groups: [{ id: 'g-early', name: 'SRI_SLR1_17:00-18:30' }] }),
      warnings,
    )
    expect(plan.groups[0].action).toBe('create')
    expect(plan.warnings.some((w) => w.level === 'warn' && w.message.includes('different time'))).toBe(true)
  })
})

describe('buildImportPlan — teachers', () => {
  it('matches staff by diacritic-insensitive full name', () => {
    const warnings: ImportWarning[] = []
    const sheets = [contactSheet('SRI_SLR1_1830-20', 'VITO DRNJEVIĆ', [['IVA', 'IVIĆ', false]], warnings)]
    const plan = buildImportPlan(
      sheets,
      [],
      snapshot({ staff: [{ id: 'u-vito', firstName: 'Vito', lastName: 'Drnjevic' }] }),
      warnings,
    )
    expect(plan.teachers[0]).toMatchObject({ action: 'match', existingId: 'u-vito' })
  })
})

describe('buildImportPlan — students + enrollments', () => {
  it('merges the same child across two groups into one student with two enrollments', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      contactSheet('SRI_SLR1_1830-20', null, [['IVA', 'IVIĆ', true]], warnings),
      contactSheet('PET_SLR2_1830-20', null, [['IVA', 'IVIĆ', false]], warnings),
    ]
    const plan = buildImportPlan(sheets, [], snapshot(), warnings)

    expect(plan.students).toHaveLength(1)
    expect(plan.enrollments).toHaveLength(2)
    expect(plan.enrollments.map((e) => e.paid).sort()).toEqual([false, true])
    // Conflicting parent emails across the two sheets get flagged, not split.
    expect(plan.warnings.some((w) => w.message.includes('two different parent emails'))).toBe(true)
  })

  it('matches an existing DB student instead of creating a duplicate', () => {
    const warnings: ImportWarning[] = []
    const sheets = [contactSheet('SRI_SLR1_1830-20', null, [['IVA', 'IVIĆ', false]], warnings)]
    const plan = buildImportPlan(
      sheets,
      [],
      snapshot({ students: [{ id: 'u-iva', firstName: 'Iva', lastName: 'Ivić', parentEmail: null }] }),
      warnings,
    )
    expect(plan.students[0]).toMatchObject({ action: 'match', existingId: 'u-iva' })
  })

  it('treats diacritic variants of the same name as the same child', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      contactSheet('SRI_SLR1_1830-20', null, [['IVA', 'IVIĆ', false]], warnings),
      contactSheet('PET_SLR2_1830-20', null, [['IVA', 'IVIC', false]], warnings),
    ]
    const plan = buildImportPlan(sheets, [], snapshot(), warnings)
    expect(plan.students).toHaveLength(1)
    expect(plan.enrollments).toHaveLength(2)
  })

  it('uniquifies synthesized usernames against the DB and within the plan', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      contactSheet('SRI_SLR1_1830-20', null, [['ANA MARIA', 'IVIĆ', false]], warnings),
      // Distinct child whose username base collides once spaces are stripped.
      contactSheet('PET_SLR2_1830-20', null, [['ANAMARIA', 'IVIĆ', false]], warnings),
    ]
    const plan = buildImportPlan(sheets, [], snapshot({ usernames: ['anamariaivic'] }), warnings)
    expect(plan.students).toHaveLength(2)
    // Only a `create` row mints a username — the union makes that explicit
    // instead of yielding `undefined` for a matched student.
    const usernames = plan.students.flatMap((s) => (s.action === 'create' ? [s.username] : []))
    expect(usernames).toContain('anamariaivic2')
    expect(usernames).toContain('anamariaivic3')
  })
})

describe('buildImportPlan — assessments', () => {
  it('attaches assessments to the roster group and enrolls graded-but-unlisted kids', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      contactSheet('SRI_SLR1_1830-20', 'IVANO TABAK', [['IVA', 'IVIĆ', true]], warnings),
    ]
    const blocks = evaluationBlocks(
      'SVIJET LEGO ROBOTIKE 1', 'SRIJEDA', 'IVANO TABAK',
      [['IVA', 'IVIĆ'], ['MARKO', 'MARIĆ']],
      warnings,
    )
    const plan = buildImportPlan(sheets, blocks, snapshot(), warnings)

    expect(plan.assessments).toHaveLength(2)
    expect(plan.enrollments).toHaveLength(2)
    expect(plan.warnings.some((w) => w.message.includes('missing from the contact tab'))).toBe(true)
    expect(plan.teachers).toHaveLength(1) // PREDAVAČ === TRENER → one account
  })

  it('skips a block when two groups share its course+day', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      contactSheet('SRI_SLR1_1700-1830', null, [['IVA', 'IVIĆ', false]], warnings),
      contactSheet('SRI_SLR1_1830-20', null, [['ANA', 'ANIĆ', false]], warnings),
    ]
    const blocks = evaluationBlocks(
      'SVIJET LEGO ROBOTIKE 1', 'SRIJEDA', 'IVANO TABAK', [['IVA', 'IVIĆ']], warnings,
    )
    const plan = buildImportPlan(sheets, blocks, snapshot(), warnings)
    expect(plan.assessments).toHaveLength(0)
    expect(plan.warnings.some((w) => w.level === 'error' && w.message.includes('share this course+day'))).toBe(true)
  })

  it('skips a block with no matching contact tab', () => {
    const warnings: ImportWarning[] = []
    const blocks = evaluationBlocks(
      'SVIJET LEGO ROBOTIKE 2', 'PETAK', 'ANA ANIĆ', [['IVA', 'IVIĆ']], warnings,
    )
    const plan = buildImportPlan([], blocks, snapshot(), warnings)
    expect(plan.assessments).toHaveLength(0)
    expect(plan.warnings.some((w) => w.level === 'error' && w.message.includes('No contact tab'))).toBe(true)
  })

  it('resolves COURSE recommendations to DB course ids', () => {
    const warnings: ImportWarning[] = []
    const sheets = [contactSheet('SRI_SLR1_1830-20', 'IVANO TABAK', [['IVA', 'IVIĆ', false]], warnings)]
    const grid: Grid = [
      ['PROGRAM: SVIJET LEGO ROBOTIKE 1'],
      ['GRUPA: SRIJEDA'],
      ['PREDAVAČ: IVANO TABAK'],
      ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
      [1, 'IVA', 'IVIĆ', 'Ostvareno', null, null, null, null, null, null, 'SVIJET LEGO ROBOTIKE 2'],
    ]
    const blocks = parseEvaluationSheet(grid, warnings)
    const plan = buildImportPlan(sheets, blocks, snapshot(), warnings)
    expect(plan.assessments[0]).toMatchObject({
      recommendationKind: 'COURSE',
      recommendedCourseId: SLR2.id,
    })
  })
})
