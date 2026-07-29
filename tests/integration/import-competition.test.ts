/**
 * Full-pipeline test for the natjecateljski-program importer: builds a real
 * .xlsx in memory, then runs read → parse → snapshot → plan → apply against the
 * test DB, and re-runs to prove idempotency. Mirrors
 * scripts/import-competition.ts end to end.
 *
 * The real archive holds children's personal data and cannot be committed, so
 * this fixture IS the specification of the layout the importer expects — every
 * quirk the owner described is represented here: the staff block above the
 * roster on one tab and below it on the other, a 1900 date of birth, and the
 * contact columns used the two different ways round.
 */
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import type { ImportWarning } from '@/lib/import-common/grid'
import { readWorkbookGrids } from '@/lib/import-common/xlsx'
import { applyCompetitionPlan } from '@/lib/import-competition/apply'
import { buildCompetitionPlan, type CompetitionPlan } from '@/lib/import-competition/plan'
import { loadCompetitionSnapshot } from '@/lib/import-competition/snapshot'
import { parseCompetitionWorkbook } from '@/lib/import-competition/workbook'

import { createCourseSeason, createGroup, createLocation, createTeacher, ensureCourse } from './helpers/factory'

const YEAR = '2025/2026'
const YEAR_START = 2025

async function buildWorkbookBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Izvješće: one stacked block per group, keyed by WEEKDAY ────────────────
  const izvjesce = wb.addWorksheet('IZVJEŠĆE 202526')
  izvjesce.addRows([
    ['NATJECATELJSKI PROGRAM: PONEDJELJAK'],
    // Vertically merged BR./IME/PREZIME repeat their captions on the second row.
    ['BR.', 'IME:', 'PREZIME:', 'PRAKTIČNE VJEŠTINE', '', '', 'TIMSKE VJEŠTINE', '', '', 'POVRATNA INFORMACIJA', 'PREPORUKA'],
    ['BR.', 'IME:', 'PREZIME:', 'RAZRADA IDEJA', 'IZVEDIVOST', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'POVRATNA INFORMACIJA', 'PREPORUKA'],
    [1, 'TESTKO', 'NATJEĆIĆ', 'Ostvareno', 'U razvoju', 'Početno', 'Ostvareno', 'Ostvareno', 'U razvoju', 'Odličan napredak.', 'NATJECATELJSKI PROGRAM - FLL'],
    [2, 'TESTA', 'NATJEČA', 'Početno', '', 'U razvoju', '', 'Ostvareno', 'Ostvareno', '', 'PRIJELAZ NA NATJECATELJSKI PROGRAM'],
    [3, 'TESTOR', 'NATJEODLAZ', 'Početno', '', '', '', '', '', 'Vraća se na SLR.', 'SVIJET LEGO ROBOTIKE 2'],
    [],
    ['NATJECATELJSKI PROGRAM: SUBOTA'],
    // Two mentors sharing one cell, the archive's `/` spelling.
    ['MENTOR: TESTVITO NATJEMENTOR / TESTASJA NATJEPOMOĆ'],
    ['BR.', 'IME:', 'PREZIME:', 'RAZRADA IDEJA', 'IZVEDIVOST', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'POVRATNA INFORMACIJA', 'PREPORUKA'],
    [1, 'TESTAN', 'NATJEČNIK', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Sve super.', 'WRO'],
  ])
  // The merged two-row header the real sheet uses.
  izvjesce.mergeCells('D2:F2')
  izvjesce.mergeCells('G2:I2')

  // ── Group tab matching a group that already exists; staff block ABOVE ──────
  // MAIL carries the Outlook paste, RODITELJ is a plain name. Real-archive
  // quirks: the `DATUM ROD.` caption, a mentor carrying a parenthetical note,
  // an unfilled `ASISTENT:` whose merged cells repeat the caption, and the
  // month columns that must be ignored.
  const pon = wb.addWorksheet('PON 1700-1830')
  pon.addRows([
    ['NATJECATELJSKI PROGRAM: FLL', '', ''],
    ['MENTOR 1: TESTIVANO NATJETABAK (12.03.2026.)', '', ''],
    ['MENTOR 2: TESTVITO NATJEMENTOR', '', ''],
    ['ASISTENT:', 'ASISTENT:', 'ASISTENT:'],
    ['BR.', 'IME', 'PREZIME', 'DATUM ROD.', 'RAZRED', 'RODITELJ', 'MAIL', 'MOBITEL', '9. MJ.', '10. MJ.'],
    [1, 'TESTKO', 'NATJEĆIĆ', '12.3.2014.', '5. r', 'RODITELJKA NATJEĆIĆ', 'Roditeljka Natjećić <Roditeljka.Natjecic@Example.com>', '0917654321', 40, 40],
    // An unfilled roster slot in the MIDDLE of the table — everything below it
    // must still import.
    [2, '', '', '', '', '', '', '', '', ''],
    [3, 'TESTA', 'NATJEČA', '2013-11-05', '4. r', '', 'roditelj.natjeca@example.com', '0918765432', '', ''],
    [4, 'TESTOR', 'NATJEODLAZ', '9.9.2012.', '7. r', 'RODITELJ NATJEODLAZ', 'r.natjeodlaz@example.com', '0913334444', '', ''],
  ])

  // ── Group tab for a group that does NOT exist yet; staff block BELOW ───────
  // RODITELJ carries the Outlook paste and MAIL is empty; one junk 1900 DOB.
  const sub = wb.addWorksheet('SUB 900-1030')
  sub.addRows([
    ['BR.', 'IME', 'PREZIME', 'DATUM ROD.', 'RAZRED', 'RODITELJ', 'MAIL', 'MOBITEL'],
    [1, 'TESTAN', 'NATJEČNIK', '1.1.1900.', '6. r', 'Roditeljan Natječnik <roditeljan.natjecnik@example.com>', '', '0919876543'],
    [],
    ['NATJECATELJSKI PROGRAM: WRO TIM'],
    ['MENTOR 1: TESTVITO NATJEMENTOR'],
    ['ASISTENT: TESTASJA NATJEPOMOĆ'],
  ])

  // ── A second tab claiming the SAME team name, on another day ───────────────
  // Both must import as separate groups with distinguishable names.
  const pet = wb.addWorksheet('PET 1930-2100')
  pet.addRows([
    ['NATJECATELJSKI PROGRAM: FLL'],
    ['MENTOR 1: TESTIVANO NATJETABAK'],
    ['MENTOR 2:', 'MENTOR 2:'],
    ['BR.', 'IME', 'PREZIME', 'DATUM ROD.', 'RAZRED', 'RODITELJ', 'MAIL', 'MOBITEL'],
    [1, 'TESTNA', 'NATJEPETKOVA', '3.6.2012.', '8. r', '', 'roditelj.petkova@example.com', '0911112222'],
  ])

  // ── A sheet the importer must ignore ───────────────────────────────────────
  wb.addWorksheet('Info').addRow(['Interne bilješke'])

  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function runPipeline(
  buffer: Buffer,
): Promise<{ plan: CompetitionPlan; result: Awaited<ReturnType<typeof applyCompetitionPlan>> }> {
  const sheets = await readWorkbookGrids(buffer)
  const warnings: ImportWarning[] = []
  const { groupSheets, evaluationBlocks } = parseCompetitionWorkbook(sheets, YEAR_START, warnings)
  const snapshot = await loadCompetitionSnapshot(db, YEAR, 'SPLIT')
  const plan = buildCompetitionPlan(groupSheets, evaluationBlocks, snapshot, warnings)
  const result = await applyCompetitionPlan(db, plan)
  return { plan, result }
}

describe('import-competition pipeline', () => {
  let existingGroupId: string
  let existingMentorId: string
  let slr2Id: string
  /** 2025-09 … 2026-06 inclusive. */
  const SEASON_MONTHS = 10

  beforeAll(async () => {
    // The venue is looked up by name, so a second "Velebitska" row would make
    // which one the importer picks arbitrary — reuse whatever is already there.
    const location =
      (await db.location.findFirst({ where: { city: 'SPLIT', name: { contains: 'Velebitska' } } })) ??
      (await createLocation({ name: 'Velebitska 32', city: 'SPLIT' }))
    const competition = await ensureCourse({
      slug: 'natjecateljski-program',
      title: 'Natjecateljski program',
      kind: 'COMPETITION',
    })
    const slr2 = await ensureCourse({ slug: 'slr-2', title: 'Svijet LEGO robotike 2' })
    // A COURSE preporuka may only point at a levelled standard program.
    await db.course.update({ where: { id: slr2.id }, data: { level: 'SLR_2' } })
    slr2Id = slr2.id

    await createCourseSeason(competition.id, {
      schoolYear: YEAR,
      city: 'SPLIT',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    })

    // Mentor who already has an account (must be matched, not duplicated).
    const mentor = await createTeacher({ firstName: 'Testivano', lastName: 'Natjetabak' })
    existingMentorId = mentor.id

    // The Monday group already exists under a name of the association's choosing.
    const group = await createGroup({
      courseId: competition.id,
      locationId: location.id,
      name: 'FLL + Robokup – ponedjeljkom',
      schoolYear: YEAR,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
      city: 'SPLIT',
    })
    existingGroupId = group.id
  })

  it('imports the workbook: matches existing rows, creates the rest', async () => {
    const { plan, result } = await runPipeline(await buildWorkbookBuffer())

    expect(plan.warnings.filter((w) => w.level === 'error')).toEqual([])

    // ── Groups: PON matched on day+time, SUB and PET created ─────────────────
    expect(result.groupsCreated).toBe(2)
    expect(plan.groups.find((g) => g.tabName === 'PON 1700-1830')).toMatchObject({
      action: 'match',
      existingId: existingGroupId,
    })
    const subGroup = await db.scheduledGroup.findFirst({
      where: { schoolYear: YEAR, name: 'WRO TIM' },
    })
    expect(subGroup).toMatchObject({
      city: 'SPLIT',
      dayOfWeek: 'Subota',
      startTime: '9:00',
      endTime: '10:30',
    })

    // Two tabs both call their team "FLL": the matched PON group keeps its
    // stored name, and the new PET group gets its weekday appended.
    const petGroup = await db.scheduledGroup.findFirst({
      where: { schoolYear: YEAR, name: 'FLL – petkom' },
    })
    expect(petGroup).toMatchObject({ dayOfWeek: 'Petak', startTime: '19:30' })

    // ── Staff: every mentor and assistant assigned, existing one reused ───────
    const createdMentor = await db.user.findFirst({
      where: { firstName: 'Testvito', lastName: 'Natjementor' },
    })
    expect(createdMentor).toMatchObject({
      role: 'TEACHER',
      city: 'SPLIT',
      email: 'testvitonatjementor@teacher.inovatic.local',
      plainPassword: null,
    })
    // A parenthetical note after mentor 1's name must not reach the surname,
    // and the merged, unfilled ASISTENT row must not become a person.
    expect(await db.user.count({ where: { firstName: 'Asistent' } })).toBe(0)
    expect(await db.user.count({ where: { firstName: 'Mentor' } })).toBe(0)
    expect(existingMentorId).toBe(
      (await db.user.findFirstOrThrow({ where: { firstName: 'Testivano', lastName: 'Natjetabak' } })).id,
    )

    // PON: mentor 1 + mentor 2 (the blank ASISTENT row contributes nobody).
    const ponStaff = await db.teacherAssignment.findMany({ where: { scheduledGroupId: existingGroupId } })
    expect(ponStaff.map((a) => a.userId).sort()).toEqual([existingMentorId, createdMentor!.id].sort())
    // SUB: the staff block sits BELOW the roster and is still picked up.
    const subStaff = await db.teacherAssignment.findMany({ where: { scheduledGroupId: subGroup!.id } })
    expect(subStaff).toHaveLength(2)
    // PON 2 + SUB 2 + PET 1
    expect(result.assignmentsCreated).toBe(5)

    // ── Students: DOB parsed, junk DOB dropped, contacts read from either column
    const testko = await db.user.findFirst({ where: { firstName: 'Testko', lastName: 'Natjećić' } })
    expect(testko).toMatchObject({
      role: 'STUDENT',
      city: 'SPLIT',
      username: 'testkonatjecic',
      email: 'testkonatjecic@student.inovatic.local',
      plainPassword: null,
      dateOfBirth: '2014-03-12',
      parentName: 'Roditeljka Natjećić',
      parentEmail: 'roditeljka.natjecic@example.com',
      parentPhone: '0917654321',
    })
    // RODITELJ empty, MAIL a bare address: no name to store, address still read.
    const testa = await db.user.findFirst({ where: { firstName: 'Testa', lastName: 'Natječa' } })
    expect(testa).toMatchObject({
      dateOfBirth: '2013-11-05',
      parentName: null,
      parentEmail: 'roditelj.natjeca@example.com',
    })
    // 1900 is data-entry junk: the child imports, the date does not.
    const testan = await db.user.findFirst({ where: { firstName: 'Testan', lastName: 'Natječnik' } })
    expect(testan).toMatchObject({
      dateOfBirth: null,
      // …and the Outlook paste in RODITELJ still yields both name and address.
      parentName: 'Roditeljan Natječnik',
      parentEmail: 'roditeljan.natjecnik@example.com',
    })
    expect(plan.warnings.some((w) => w.message.includes('outside 3–25 years'))).toBe(true)
    // The blank roster slot between rows 1 and 3 of the PON tab must not have
    // truncated that tab — Testa sits below it.
    expect(testa).not.toBeNull()
    expect(result.studentsCreated).toBe(5)

    // ── Enrollments: every season month written, all already paid ─────────────
    // The monthly `9. MJ.`/`10. MJ.` columns are deliberately ignored: the
    // owner's decision is that an archived year imports fully settled.
    expect(result.enrollmentsCreated).toBe(5)
    expect(plan.seasonMonths).toHaveLength(SEASON_MONTHS)
    const testkoEnrollment = await db.enrollment.findFirst({
      where: { userId: testko!.id, scheduledGroupId: existingGroupId },
      include: { enrollmentMonths: true },
    })
    expect(testkoEnrollment?.schoolYear).toBe(YEAR)
    expect(testkoEnrollment?.enrollmentMonths).toHaveLength(SEASON_MONTHS)
    expect(testkoEnrollment?.enrollmentMonths.every((m) => m.paidAt !== null)).toBe(true)
    expect(result.monthsCreated).toBe(5 * SEASON_MONTHS)

    // ── Report cards: the competition rubric only ────────────────────────────
    expect(result.assessmentsCreated).toBe(4)  // PET has no izvješće block
    const testkoCard = await db.studentAssessment.findUnique({
      where: { studentId_groupId: { studentId: testko!.id, groupId: existingGroupId } },
    })
    expect(testkoCard).toMatchObject({
      razradaIdeja: 'OSTVARENO',
      izvedivost: 'U_RAZVOJU',
      inovacije: 'POCETNO',
      suradnja: 'OSTVARENO',
      komunikacija: 'OSTVARENO',
      zabava: 'U_RAZVOJU',
      opisnaOcjena: 'Odličan napredak.',
      recommendationKind: 'COMPETITION_FLL',
      recommendedCourseId: null,
      // Author is mentor 1 off the group tab.
      authorId: existingMentorId,
    })
    // The SLR columns must stay empty on a competition card.
    expect(testkoCard?.slaganje).toBeNull()
    expect(testkoCard?.programiranje).toBeNull()

    // "PRIJELAZ NA NATJECATELJSKI PROGRAM" is the archive's usual spelling of
    // the program-level track.
    const testaCard = await db.studentAssessment.findFirst({ where: { studentId: testa!.id } })
    expect(testaCard).toMatchObject({
      recommendationKind: 'COMPETITION_PROGRAM',
      recommendedCourseId: null,
    })
    // A COURSE preporuka still resolves to the course row.
    const testor = await db.user.findFirst({ where: { firstName: 'Testor', lastName: 'Natjeodlaz' } })
    const testorCard = await db.studentAssessment.findFirst({ where: { studentId: testor!.id } })
    expect(testorCard).toMatchObject({ recommendationKind: 'COURSE', recommendedCourseId: slr2Id })

    const testanCard = await db.studentAssessment.findFirst({ where: { studentId: testan!.id } })
    expect(testanCard).toMatchObject({
      recommendationKind: 'COMPETITION_WRO',
      // The block names its own mentors ("A / B"); the first authors the cards.
      authorId: createdMentor!.id,
      opisnaOcjena: 'Sve super.',
    })
  })

  it('is idempotent: a second run creates nothing new', async () => {
    const before = {
      users: await db.user.count(),
      groups: await db.scheduledGroup.count(),
      enrollments: await db.enrollment.count(),
      months: await db.enrollmentMonth.count(),
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
    expect(result.monthsCreated).toBe(0)
    expect(result.assessmentsCreated).toBe(0)
    expect(result.assessmentsUpdated).toBe(4) // same data rewritten, nothing added

    const after = {
      users: await db.user.count(),
      groups: await db.scheduledGroup.count(),
      enrollments: await db.enrollment.count(),
      months: await db.enrollmentMonth.count(),
      assessments: await db.studentAssessment.count(),
      assignments: await db.teacherAssignment.count(),
    }
    expect(after).toEqual(before)
  })
})
