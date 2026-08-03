import { describe, expect, it } from 'vitest'

import type { Grid, ImportWarning } from '@/lib/import-common/grid'
import {
  parseCompetitionEvaluationSheet,
  parseGroupSheet,
  type CompetitionEvaluationBlock,
  type CompetitionGroupSheet,
} from '@/lib/import-competition/parse'
import { buildCompetitionPlan, type CompetitionSnapshot } from '@/lib/import-competition/plan'

const YEAR_START = 2025
const SLR2 = { id: 'course-slr2', slug: 'slr-2' }

function snapshot(overrides: Partial<CompetitionSnapshot> = {}): CompetitionSnapshot {
  return {
    schoolYear: '2025/2026',
    city: 'SPLIT',
    location: { id: 'loc-1', name: 'Velebitska 32' },
    competitionCourseId: 'course-natj',
    seasonMonths: [new Date(Date.UTC(2025, 8, 1)), new Date(Date.UTC(2025, 9, 1))],
    season: { startDate: new Date(Date.UTC(2025, 8, 1)), endDate: new Date(Date.UTC(2025, 9, 30)) },
    courses: [SLR2],
    groups: [],
    staff: [],
    students: [],
    usernames: [],
    emails: [],
    ...overrides,
  }
}

function groupSheet(
  tabName: string,
  team: string | null,
  staff: (string | null)[],
  rows: string[][],
  warnings: ImportWarning[],
): CompetitionGroupSheet {
  const grid: Grid = [
    ...(team ? [[`NATJECATELJSKI PROGRAM: ${team}`]] : []),
    ...staff.map((name, i) => [i === 2 ? `ASISTENT: ${name ?? ''}` : `MENTOR ${i + 1}: ${name ?? ''}`]),
    ['BR.', 'IME:', 'PREZIME:', 'DATUM ROĐENJA:', 'RODITELJ:', 'MAIL:', 'MOBITEL:'],
    ...rows.map(([first, last], i): Grid[number] => [
      i + 1, first, last, '12.3.2014.', `RODITELJ ${last}`, `r.${i}.${tabName}@example.com`, '0910000000',
    ]),
  ]
  const sheet = parseGroupSheet(tabName, grid, YEAR_START, warnings)
  if (!sheet) throw new Error(`fixture tab name did not parse: ${tabName}`)
  return sheet
}

function evaluationBlocks(
  day: string,
  mentor: string | null,
  rows: [string, string, string][],
  warnings: ImportWarning[],
): CompetitionEvaluationBlock[] {
  const grid: Grid = [
    [`NATJECATELJSKI PROGRAM: ${day}`],
    ...(mentor ? [[`MENTOR 1: ${mentor}`]] : []),
    ['BR.', 'IME:', 'PREZIME:', 'RAZRADA IDEJA', 'IZVEDIVOST', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
    ...rows.map(([first, last, preporuka], i): Grid[number] => [
      i + 1, first, last, 'Ostvareno', 'U razvoju', null, null, null, null, 'Komentar.', preporuka,
    ]),
  ]
  return parseCompetitionEvaluationSheet(grid, warnings)
}

describe('buildCompetitionPlan — groups', () => {
  it('names a created group after the team on its own tab', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(sheets, [], snapshot(), warnings)

    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({
      action: 'create',
      name: 'WRO TIM',
      slot: { dayOfWeek: 'Subota', startTime: '9:00', endTime: '10:30' },
    })
  })

  it('falls back to a weekday name when the tab has no team label', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', null, ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(sheets, [], snapshot(), warnings)
    // Instrumental form, matching the prod convention ("WRO – srijedom").
    expect(plan.groups[0].name).toBe('Natjecateljski program – subotom')
  })

  it('appends the weekday only when two tabs claim the same team name', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      groupSheet('PON 1700-1830', 'FLL', ['PRVI MENTOR'], [['ANA', 'ANIĆ']], warnings),
      groupSheet('PET 1930-2100', 'FLL', ['DRUGI MENTOR'], [['IVO', 'IVIĆ']], warnings),
      groupSheet('SUB 900-1030', 'PRIPREME ZA NATJECANJA', ['TRECI MENTOR'], [['MIA', 'MIĆ']], warnings),
    ]
    const plan = buildCompetitionPlan(sheets, [], snapshot(), warnings)

    expect(plan.groups.map((g) => g.name)).toEqual([
      'FLL – ponedjeljkom',
      'FLL – petkom',
      // Used once, so it is left exactly as the sheet writes it.
      'PRIPREME ZA NATJECANJA',
    ])
  })

  it('matches an existing group on day + start time, keeping its stored name', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('PON 1700-1830', 'FLL TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(
      sheets,
      [],
      snapshot({
        groups: [{ id: 'g-1', name: 'FLL + Robokup – ponedjeljkom', dayOfWeek: 'Ponedjeljak', startTime: '17:00' }],
      }),
      warnings,
    )
    expect(plan.groups[0]).toMatchObject({
      action: 'match',
      existingId: 'g-1',
      name: 'FLL + Robokup – ponedjeljkom',
    })
  })

  it('creates a separate group (with a warning) when the day matches but the time differs', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('PON 1700-1830', 'FLL TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(
      sheets,
      [],
      snapshot({ groups: [{ id: 'g-late', name: 'WRO', dayOfWeek: 'Ponedjeljak', startTime: '18:30' }] }),
      warnings,
    )
    expect(plan.groups[0].action).toBe('create')
    expect(plan.warnings.some((w) => w.level === 'warn' && w.message.includes('different time'))).toBe(true)
  })

  it('assigns every mentor and assistant to the group', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      groupSheet('SUB 900-1030', 'WRO TIM', ['PRVI MENTOR', 'DRUGI MENTOR', 'ASJA POMOĆ'], [['ANA', 'ANIĆ']], warnings),
    ]
    const plan = buildCompetitionPlan(sheets, [], snapshot(), warnings)
    expect(plan.groups[0].teacherKeys).toHaveLength(3)
    expect(plan.teachers.map((t) => `${t.firstName} ${t.lastName}`)).toEqual([
      'Prvi Mentor', 'Drugi Mentor', 'Asja Pomoć',
    ])
  })
})

describe('buildCompetitionPlan — evaluation blocks', () => {
  it('matches a block to its group by weekday alone', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const blocks = evaluationBlocks('SUBOTA', null, [['ANA', 'ANIĆ', 'WRO']], warnings)
    const plan = buildCompetitionPlan(sheets, blocks, snapshot(), warnings)

    expect(plan.assessments).toHaveLength(1)
    expect(plan.assessments[0]).toMatchObject({
      groupKey: plan.groups[0].key,
      recommendationKind: 'COMPETITION_WRO',
      recommendedCourseId: null,
      // Mentor 1 off the group tab authors the card.
      authorKey: plan.groups[0].teacherKeys[0],
    })
    expect(plan.assessments[0].skills).toMatchObject({ razradaIdeja: 'OSTVARENO', izvedivost: 'U_RAZVOJU' })
  })

  it('refuses to guess when two groups run on the same weekday', () => {
    const warnings: ImportWarning[] = []
    const sheets = [
      groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings),
      groupSheet('SUB 1100-1230', 'FLL TIM', ['VITO MENTOR'], [['IVO', 'IVIĆ']], warnings),
    ]
    const blocks = evaluationBlocks('SUBOTA', null, [['ANA', 'ANIĆ', 'WRO']], warnings)
    const plan = buildCompetitionPlan(sheets, blocks, snapshot(), warnings)

    expect(plan.assessments).toHaveLength(0)
    expect(
      plan.warnings.some((w) => w.level === 'error' && w.message.includes('cannot tell them apart')),
    ).toBe(true)
  })

  it("prefers the block's own mentor as the report-card author", () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const blocks = evaluationBlocks('SUBOTA', 'VITO DRNJEVIĆ', [['ANA', 'ANIĆ', 'WRO']], warnings)
    const plan = buildCompetitionPlan(sheets, blocks, snapshot(), warnings)

    const author = plan.teachers.find((t) => t.key === plan.assessments[0].authorKey)
    expect(author).toMatchObject({ firstName: 'Vito', lastName: 'Drnjević' })
  })

  it('enrolls a graded child who is missing from the group tab, and says so', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const blocks = evaluationBlocks('SUBOTA', null, [['IVO', 'IVIĆ', 'WRO']], warnings)
    const plan = buildCompetitionPlan(sheets, blocks, snapshot(), warnings)

    expect(plan.enrollments).toHaveLength(2)
    const ivo = plan.students.find((s) => s.firstName === 'Ivo')
    expect(ivo).toMatchObject({ dateOfBirth: null, parentEmail: null })
    expect(plan.warnings.some((w) => w.message.includes('graded but missing from the group tab'))).toBe(true)
  })

  it('resolves a COURSE preporuka to the course id', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const blocks = evaluationBlocks('SUBOTA', null, [['ANA', 'ANIĆ', 'SVIJET LEGO ROBOTIKE 2']], warnings)
    const plan = buildCompetitionPlan(sheets, blocks, snapshot(), warnings)
    expect(plan.assessments[0]).toMatchObject({
      recommendationKind: 'COURSE',
      recommendedCourseId: SLR2.id,
    })
  })
})

describe('buildCompetitionPlan — students', () => {
  it('matches an existing student by name rather than creating a duplicate', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(
      sheets,
      [],
      snapshot({ students: [{ id: 'u-ana', firstName: 'Ana', lastName: 'Anic', dateOfBirth: null }] }),
      warnings,
    )
    expect(plan.students[0]).toMatchObject({ action: 'match', existingId: 'u-ana' })
  })

  it('flags a stored date of birth that disagrees with the workbook', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(
      sheets,
      [],
      snapshot({ students: [{ id: 'u-ana', firstName: 'Ana', lastName: 'Anić', dateOfBirth: '2010-01-01' }] }),
      warnings,
    )
    expect(plan.students[0]).toMatchObject({ action: 'match' })
    expect(
      plan.warnings.some((w) => w.level === 'error' && w.message.includes('already exists with date of birth')),
    ).toBe(true)
  })

  it('warns when the year has no planned season, so nothing would be billed', () => {
    const warnings: ImportWarning[] = []
    const sheets = [groupSheet('SUB 900-1030', 'WRO TIM', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)]
    const plan = buildCompetitionPlan(sheets, [], snapshot({ seasonMonths: [], season: null }), warnings)
    expect(plan.warnings.some((w) => w.message.includes('No CourseSeason dates'))).toBe(true)
  })

  it('refuses a second tab that normalizes to an already-claimed slot instead of merging rosters', () => {
    const warnings: ImportWarning[] = []
    // 'SUB 900-1030' and 'SUB 0900-1030' both normalize to Subota 9:00 — apply
    // would silently pour both rosters into whichever group registers last.
    const a = groupSheet('SUB 900-1030', 'PRIPREME ZA NATJECANJA', ['IVANO TABAK'], [['ANA', 'ANIĆ']], warnings)
    const b = groupSheet('SUB 0900-1030', 'WRO TIM', ['PERO PERIĆ'], [['IVO', 'IVIĆ']], warnings)
    const plan = buildCompetitionPlan([a, b], [], snapshot(), warnings)

    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0].name).toBe('PRIPREME ZA NATJECANJA')
    // Only the first tab's child is enrolled — nothing from the skipped tab.
    expect(plan.enrollments).toHaveLength(1)
    expect(
      plan.warnings.some((w) => w.level === 'error' && w.message.includes('already covers')),
    ).toBe(true)
  })
})
