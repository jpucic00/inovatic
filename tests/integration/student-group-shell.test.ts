/**
 * `getStudentGroupShell` feeds the portal group layout — the header card and
 * the tab strip that every panel renders under. It is a NEW access gate
 * (2026-08-24): the layout resolves it before any panel loads, so it has to
 * refuse exactly what the panels' own reads refuse. The enrollment lookup is
 * the gate, as in materials/gallery/assessment; `requireActiveStudent` in
 * front of it is what keeps an expired account out entirely.
 */
import { describe, expect, it } from 'vitest'
import { computeSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  createCourse,
  createEnrollment,
  createGroup,
  createModule,
  createModuleSchedule,
  createStudent,
} from './helpers/factory'

const { getStudentGroupShell } = await import('@/actions/student/group')

const CY = computeSchoolYear()
const PAST = '2023/2024'
const DAY = 24 * 60 * 60 * 1000

/**
 * `notFound()` and not `redirect()` — the digest is the contract, since a
 * redirect to /portal from inside the portal layout would loop. Same matcher
 * as student-active-program-gate.test.ts.
 */
async function expectNotFound(p: Promise<unknown>): Promise<void> {
  await expect(p).rejects.toMatchObject({
    digest: expect.stringMatching(/^NEXT_(NOT_FOUND|HTTP_ERROR_FALLBACK;404)$/),
  })
}

describe('getStudentGroupShell — access gate', () => {
  it("404s on a group the student isn't enrolled in", async () => {
    const student = await createStudent()
    const ownGroup = await createGroup()
    await createEnrollment(student.id, ownGroup.id, { schoolYear: CY })
    const otherGroup = await createGroup()

    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    await expectNotFound(getStudentGroupShell(otherGroup.id))
  })

  it('refuses a student whose only enrollment is a settled past year', async () => {
    // The enrollment lookup itself is deliberately year-blind (looking back at
    // your own old group is legitimate) — what refuses this caller is
    // `requireActiveStudent`, which needs an enrollment in the current or next
    // year. Only enrolled long ago, the child gets a 404, not a redirect loop.
    const student = await createStudent()
    const group = await createGroup({ schoolYear: PAST })
    await createEnrollment(student.id, group.id, { schoolYear: PAST })

    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })

    await expectNotFound(getStudentGroupShell(group.id))
  })

  it('rejects a caller that is not a student', async () => {
    const group = await createGroup()
    mockSession(null)

    await expect(getStudentGroupShell(group.id)).rejects.toThrow()
  })
})

describe('getStudentGroupShell — shell contract', () => {
  it('returns the header facts and the running module for a dated STANDARD group', async () => {
    const student = await createStudent()
    const course = await createCourse({ kind: 'STANDARD' })
    const mod = await createModule(course.id, { title: 'Prometni sustavi', sortOrder: 0 })
    await createModuleSchedule(mod.id, {
      schoolYear: CY,
      startDate: new Date(Date.now() - 7 * DAY),
      endDate: new Date(Date.now() + 30 * DAY),
    })
    const group = await createGroup({ courseId: course.id, schoolYear: CY })
    await createEnrollment(student.id, group.id, { schoolYear: CY })

    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })
    const shell = await getStudentGroupShell(group.id)

    expect(shell.group.id).toBe(group.id)
    expect(shell.group.course.title).toBe(course.title)
    expect(shell.kind).toBe('STANDARD')
    // The "Aktivan modul" pill and the tab strip read exactly these.
    expect(shell.activeModule?.title).toBe('Prometni sustavi')
    expect(shell.modules.map((m) => m.title)).toEqual(['Prometni sustavi'])
  })

  it('resolves a radionica with no modules and no active-module pill', async () => {
    const student = await createStudent()
    const course = await createCourse({ kind: 'RADIONICA' })
    const group = await createGroup({ courseId: course.id, schoolYear: CY })
    await createEnrollment(student.id, group.id, { schoolYear: CY })

    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })
    const shell = await getStudentGroupShell(group.id)

    expect(shell.kind).toBe('RADIONICA')
    expect(shell.activeModule).toBeNull()
    expect(shell.modules).toEqual([])
  })
})
