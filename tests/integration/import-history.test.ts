/**
 * Full-pipeline test for the historical-workbook importer: builds a real .xlsx
 * in memory (merged evaluation header and all), then runs
 * read → parse → snapshot → plan → apply against the test DB, and re-runs to
 * prove idempotency. Mirrors scripts/import-history.ts end to end.
 */
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { applyImportPlan } from '@/lib/import-history/apply'
import type { ImportWarning } from '@/lib/import-history/parse'
import { buildImportPlan, type ImportPlan } from '@/lib/import-history/plan'
import { loadSnapshot } from '@/lib/import-history/snapshot'
import { parseWorkbookSheets } from '@/lib/import-history/workbook'
import { readWorkbookGrids } from '@/lib/import-history/xlsx'

import { createCourse, createGroup, createLocation, createTeacher } from './helpers/factory'

const YEAR = '2025/2026'

async function buildWorkbookBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Evaluation sheet: two stacked blocks, merged two-row header ────────────
  const evalSheet = wb.addWorksheet('Evaluacija')
  evalSheet.addRows([
    ['PROGRAM: SVIJET LEGO ROBOTIKE 1'],
    ['GRUPA: SRIJEDA'],
    ['PREDAVAČ: TESTIVANO UVOZTABAK'],
    ['BR.', 'IME:', 'PREZIME:', 'PRAKTIČNE VJEŠTINE', '', '', 'TIMSKE VJEŠTINE', '', '', 'OPISNA OCJENA:', 'PREPORUKA:'],
    ['', '', '', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', '', ''],
    [1, 'TESTKO', 'UVOZNIĆ', 'Ostvareno', 'U razvoju', 'Početno', 'Ostvareno', 'Ostvareno', 'U razvoju', 'Odličan napredak.', 'SVIJET LEGO ROBOTIKE 2'],
    [2, 'TESTA', 'UVOZNA', 'Početno', '', 'U razvoju', '', 'Ostvareno', 'Ostvareno', '', 'Priprema za natjecanja'],
    [],
    ['PROGRAM: SVIJET LEGO ROBOTIKE 1'],
    ['GRUPA: ČETVRTAK'],
    ['PREDAVAČ: TESTVITO UVOZDRNJEVIĆ'],
    ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
    [1, 'TESTAN', 'UVOZNIK', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Sve super.', 'Natjecateljski program'],
  ])
  // Merge the two-row header the way the real sheet does.
  evalSheet.mergeCells('A4:A5')
  evalSheet.mergeCells('B4:B5')
  evalSheet.mergeCells('C4:C5')
  evalSheet.mergeCells('D4:F4')
  evalSheet.mergeCells('G4:I4')
  evalSheet.mergeCells('J4:J5')
  evalSheet.mergeCells('K4:K5')

  // ── Contact tab for a group that does NOT exist yet ────────────────────────
  const sri = wb.addWorksheet('SRI_SLR1_1830-20')
  sri.addRows([
    ['NAZIV PROGRAMA: SVIJET LEGO ROBOTIKE 1'],
    ['TRENER: TESTIVANO UVOZTABAK'],
    ['ASISTENT:'],
    ['BR.', 'IME:', 'PREZIME:', 'GODINE:', 'RAZRED:', 'RODITELJ:', 'MAIL:', 'MOBITEL:', 'ISKUSTVO:', 'OGLEDNA:', 'UGOVOR:', 'PLAĆANJE:', 'POPUST:', 'PONUDA:', 'RAČUN:', 'PLAĆENO'],
    [1, 'TESTKO', 'UVOZNIĆ', 9, '3. razred', 'RODITELJKA UVOZNIĆ', 'Roditeljka.Uvoznic@Example.com', '0917654321', 'Da', false, true, 'TRANSAKCIJSKI', '10%', true, true, true],
    [2, 'TESTA', 'UVOZNA', 8, '2. razred', 'RODITELJ UVOZNA', 'roditelj.uvozna@example.com', '0918765432', 'Ne', false, false, '', '', false, false, false],
  ])

  // ── Contact tab matching the pre-existing prod-style group ─────────────────
  const cet = wb.addWorksheet('ČET_SLR1_1830-20')
  cet.addRows([
    ['NAZIV PROGRAMA: SVIJET LEGO ROBOTIKE 1'],
    ['TRENER: TESTVITO UVOZDRNJEVIĆ'],
    ['BR.', 'IME:', 'PREZIME:', 'RODITELJ:', 'MAIL:', 'MOBITEL:', 'PLAĆENO'],
    [1, 'TESTAN', 'UVOZNIK', 'RODITELJAN UVOZNIK', 'roditeljan.uvoznik@example.com', '0919876543', true],
  ])

  // ── A sheet the importer must ignore ───────────────────────────────────────
  wb.addWorksheet('Info').addRow(['Interne bilješke'])

  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function runPipeline(buffer: Buffer): Promise<{ plan: ImportPlan; result: Awaited<ReturnType<typeof applyImportPlan>> }> {
  const sheets = await readWorkbookGrids(buffer)
  const warnings: ImportWarning[] = []
  const { contactSheets, evaluationBlocks } = parseWorkbookSheets(sheets, warnings)
  const snapshot = await loadSnapshot(db, YEAR)
  const plan = buildImportPlan(contactSheets, evaluationBlocks, snapshot, warnings)
  const result = await applyImportPlan(db, plan)
  return { plan, result }
}

describe('import-history pipeline', () => {
  let existingGroupId: string
  let existingTeacherId: string
  let slr2Id: string

  beforeAll(async () => {
    const location = await createLocation({ name: 'Velebitska 32', city: 'SPLIT' })
    const slr1 = await createCourse({ slug: 'slr-1', title: 'Svijet LEGO robotike 1' })
    const slr2 = await createCourse({ slug: 'slr-2', title: 'Svijet LEGO robotike 2' })
    slr2Id = slr2.id

    // Teacher who already has an account (must be matched, not duplicated).
    const teacher = await createTeacher({ firstName: 'Testivano', lastName: 'Uvoztabak' })
    existingTeacherId = teacher.id

    // Prod already holds the ČET group under the full-time naming convention.
    const group = await createGroup({
      courseId: slr1.id,
      locationId: location.id,
      name: 'ČET_SLR1_18:30-20:00',
      schoolYear: YEAR,
      dayOfWeek: 'Četvrtak',
      startTime: '18:30',
      endTime: '20:00',
      city: 'SPLIT',
    })
    existingGroupId = group.id
  })

  it('imports the workbook: matches existing rows, creates the rest', async () => {
    const { plan, result } = await runPipeline(await buildWorkbookBuffer())

    expect(plan.warnings.filter((w) => w.level === 'error')).toEqual([])

    // Groups: SRI created with the prod naming convention, ČET matched.
    expect(result.groupsCreated).toBe(1)
    const sriGroup = await db.scheduledGroup.findFirst({
      where: { schoolYear: YEAR, name: 'SRI_SLR1_18:30-20:00' },
    })
    expect(sriGroup).toMatchObject({
      city: 'SPLIT',
      dayOfWeek: 'Srijeda',
      startTime: '18:30',
      endTime: '20:00',
    })
    expect(plan.groups.find((g) => g.name.startsWith('ČET'))).toMatchObject({
      action: 'match',
      existingId: existingGroupId,
    })

    // Teachers: Testivano matched, Testvito created with a placeholder email.
    expect(result.teachersCreated).toBe(1)
    const createdTeacher = await db.user.findFirst({
      where: { firstName: 'Testvito', lastName: 'Uvozdrnjević' },
    })
    expect(createdTeacher).toMatchObject({
      role: 'TEACHER',
      city: 'SPLIT',
      email: 'testvitouvozdrnjevic@teacher.inovatic.local',
      plainPassword: null,
    })

    // Both groups got teacher assignments.
    expect(result.assignmentsCreated).toBe(2)
    const cetAssignment = await db.teacherAssignment.findFirst({
      where: { scheduledGroupId: existingGroupId },
    })
    expect(cetAssignment?.userId).toBe(createdTeacher!.id)

    // Students: created with app credential conventions but unusable passwords.
    expect(result.studentsCreated).toBe(3)
    const testko = await db.user.findFirst({
      where: { firstName: 'Testko', lastName: 'Uvoznić' },
    })
    expect(testko).toMatchObject({
      role: 'STUDENT',
      city: 'SPLIT',
      username: 'testkouvoznic',
      email: 'testkouvoznic@student.inovatic.local',
      plainPassword: null,
      parentName: 'Roditeljka Uvoznić',
      parentEmail: 'roditeljka.uvoznic@example.com',
      parentPhone: '0917654321',
    })

    // Enrollments + paid marks: 2 in SRI (1 paid), 1 in ČET (paid).
    expect(result.enrollmentsCreated).toBe(3)
    expect(result.paidMarked).toBe(2)
    const testkoEnrollment = await db.enrollment.findFirst({
      where: { userId: testko!.id, scheduledGroupId: sriGroup!.id },
    })
    expect(testkoEnrollment?.schoolYear).toBe(YEAR)
    expect(testkoEnrollment?.fullYearPaidAt).not.toBeNull()
    const testa = await db.user.findFirst({ where: { firstName: 'Testa', lastName: 'Uvozna' } })
    const testaEnrollment = await db.enrollment.findFirst({ where: { userId: testa!.id } })
    expect(testaEnrollment?.fullYearPaidAt).toBeNull()

    // Report cards: skills, opisna ocjena, both recommendation shapes, author.
    expect(result.assessmentsCreated).toBe(3)
    const testkoAssessment = await db.studentAssessment.findUnique({
      where: { studentId_groupId: { studentId: testko!.id, groupId: sriGroup!.id } },
    })
    expect(testkoAssessment).toMatchObject({
      slaganje: 'OSTVARENO',
      programiranje: 'U_RAZVOJU',
      inovacije: 'POCETNO',
      suradnja: 'OSTVARENO',
      komunikacija: 'OSTVARENO',
      zabava: 'U_RAZVOJU',
      opisnaOcjena: 'Odličan napredak.',
      recommendationKind: 'COURSE',
      recommendedCourseId: slr2Id,
      authorId: existingTeacherId,
    })
    const testan = await db.user.findFirst({ where: { firstName: 'Testan', lastName: 'Uvoznik' } })
    const testanAssessment = await db.studentAssessment.findFirst({
      where: { studentId: testan!.id },
    })
    expect(testanAssessment).toMatchObject({
      recommendationKind: 'COMPETITION_PROGRAM',
      recommendedCourseId: null,
      authorId: createdTeacher!.id,
    })
  })

  it('is idempotent: a second run creates nothing new', async () => {
    const before = {
      users: await db.user.count(),
      groups: await db.scheduledGroup.count(),
      enrollments: await db.enrollment.count(),
      assessments: await db.studentAssessment.count(),
      assignments: await db.teacherAssignment.count(),
    }

    const { result } = await runPipeline(await buildWorkbookBuffer())

    expect(result.teachersCreated).toBe(0)
    expect(result.groupsCreated).toBe(0)
    expect(result.assignmentsCreated).toBe(0)
    expect(result.studentsCreated).toBe(0)
    expect(result.studentsBackfilled).toBe(0)
    expect(result.enrollmentsCreated).toBe(0)
    expect(result.paidMarked).toBe(0)
    expect(result.assessmentsCreated).toBe(0)
    expect(result.assessmentsUpdated).toBe(3) // same data rewritten, nothing added

    const after = {
      users: await db.user.count(),
      groups: await db.scheduledGroup.count(),
      enrollments: await db.enrollment.count(),
      assessments: await db.studentAssessment.count(),
      assignments: await db.teacherAssignment.count(),
    }
    expect(after).toEqual(before)
  })
})
