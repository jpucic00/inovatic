/**
 * Read-only report card in the student portal. The parent/polaznik view is a
 * deliberate narrowing of the staff gradebook: only the six skill levels, the
 * descriptive grade and the mentor's recommendation cross over — internal
 * `StudentComment` bilješke must stay staff-only.
 */
import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
} from './helpers/factory'

const { getMyAssessmentForGroup } = await import('@/actions/student/assessment')

type AssessmentSeed = Partial<{
  slaganje: 'POCETNO' | 'U_RAZVOJU' | 'OSTVARENO'
  programiranje: 'POCETNO' | 'U_RAZVOJU' | 'OSTVARENO'
  inovacije: 'POCETNO' | 'U_RAZVOJU' | 'OSTVARENO'
  suradnja: 'POCETNO' | 'U_RAZVOJU' | 'OSTVARENO'
  komunikacija: 'POCETNO' | 'U_RAZVOJU' | 'OSTVARENO'
  zabava: 'POCETNO' | 'U_RAZVOJU' | 'OSTVARENO'
  opisnaOcjena: string | null
  recommendationKind: 'COURSE' | 'COMPETITION_PREP' | 'COMPETITION_PROGRAM'
  recommendedCourseId: string | null
}>

function seedAssessment(
  studentId: string,
  groupId: string,
  authorId: string,
  values: AssessmentSeed = {},
) {
  return db.studentAssessment.create({
    data: { studentId, groupId, authorId, ...values },
  })
}

describe('getMyAssessmentForGroup — access gate', () => {
  it("404s on a group the student isn't enrolled in", async () => {
    const student = await createStudent()
    const group = await createGroup()
    mockSession({ id: student.id, role: 'STUDENT' })

    await expect(getMyAssessmentForGroup(group.id)).rejects.toThrow()
  })

  it("never returns another student's report card for a shared group", async () => {
    const teacher = await createTeacher()
    const [studentA, studentB] = await Promise.all([createStudent(), createStudent()])
    const group = await createGroup()
    await createEnrollment(studentA.id, group.id)
    await createEnrollment(studentB.id, group.id)
    await seedAssessment(studentA.id, group.id, teacher.id, {
      slaganje: 'OSTVARENO',
      opisnaOcjena: 'Ocjena za polaznika A.',
    })

    mockSession({ id: studentB.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(view.assessment).toBeNull()
    expect(JSON.stringify(view)).not.toContain('Ocjena za polaznika A.')
  })

  it('rejects a non-student caller', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(getMyAssessmentForGroup(group.id)).rejects.toThrow()
  })
})

describe('getMyAssessmentForGroup — report card', () => {
  it('returns the six skills, opisna ocjena and a COURSE preporuka by title', async () => {
    const teacher = await createTeacher({ firstName: 'Ana', lastName: 'Anić' })
    const student = await createStudent()
    const group = await createGroup()
    const nextCourse = await createCourse({ title: 'Svijet LEGO robotike 2' })
    await createEnrollment(student.id, group.id)
    await seedAssessment(student.id, group.id, teacher.id, {
      slaganje: 'OSTVARENO',
      programiranje: 'U_RAZVOJU',
      inovacije: 'POCETNO',
      suradnja: 'OSTVARENO',
      komunikacija: 'U_RAZVOJU',
      zabava: 'OSTVARENO',
      opisnaOcjena: 'Vrlo motiviran polaznik.',
      recommendationKind: 'COURSE',
      recommendedCourseId: nextCourse.id,
    })

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(view.gradable).toBe(true)
    expect(view.assessment).toMatchObject({
      slaganje: 'OSTVARENO',
      programiranje: 'U_RAZVOJU',
      inovacije: 'POCETNO',
      suradnja: 'OSTVARENO',
      komunikacija: 'U_RAZVOJU',
      zabava: 'OSTVARENO',
      opisnaOcjena: 'Vrlo motiviran polaznik.',
      recommendationLabel: 'Svijet LEGO robotike 2',
      authorName: 'Ana Anić',
    })
  })

  it('resolves a special-track preporuka to its canonical label', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const group = await createGroup()
    await createEnrollment(student.id, group.id)
    await seedAssessment(student.id, group.id, teacher.id, {
      recommendationKind: 'COMPETITION_PREP',
    })

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(view.assessment?.recommendationLabel).toBe('Priprema za natjecanja')
  })

  it('treats a card with no filled field as "not graded yet"', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const group = await createGroup()
    await createEnrollment(student.id, group.id)
    await seedAssessment(student.id, group.id, teacher.id, { opisnaOcjena: '   ' })

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(view.gradable).toBe(true)
    expect(view.assessment).toBeNull()
  })

  it('reports a radionica as not gradable', async () => {
    const student = await createStudent()
    const course = await createCourse({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    const group = await createGroup({
      courseId: course.id,
      dateStart: '2026-11-02',
      dateEnd: '2026-11-06',
    })
    await createEnrollment(student.id, group.id)

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(view.gradable).toBe(false)
    expect(view.assessment).toBeNull()
  })

  it('never carries a radionica card even if a stray row exists', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const course = await createCourse({ kind: 'RADIONICA', schoolYear: '2026/2027' })
    const group = await createGroup({
      courseId: course.id,
      dateStart: '2026-11-02',
      dateEnd: '2026-11-06',
    })
    await createEnrollment(student.id, group.id)
    await seedAssessment(student.id, group.id, teacher.id, {
      slaganje: 'OSTVARENO',
      opisnaOcjena: 'Ne bi trebalo postojati.',
    })

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(view.assessment).toBeNull()
    expect(JSON.stringify(view)).not.toContain('Ne bi trebalo postojati.')
  })
})

describe('getMyAssessmentForGroup — bilješke stay staff-only', () => {
  it("omits the student's own StudentComment notes from the portal payload", async () => {
    const teacher = await createTeacher()
    const student = await createStudent()
    const group = await createGroup()
    await createEnrollment(student.id, group.id)
    await seedAssessment(student.id, group.id, teacher.id, { slaganje: 'OSTVARENO' })
    await db.studentComment.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        authorId: teacher.id,
        content: 'Interna bilješka o ponašanju.',
      },
    })

    mockSession({ id: student.id, role: 'STUDENT' })
    const view = await getMyAssessmentForGroup(group.id)

    expect(JSON.stringify(view)).not.toContain('Interna bilješka')
    expect(view).toEqual({
      group: expect.anything(),
      gradable: true,
      assessment: expect.anything(),
    })
  })
})
