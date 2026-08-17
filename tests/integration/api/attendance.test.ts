import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { zagrebDateKey } from '@/lib/attendance-window'
import { mockSession } from '../setup'
import {
  createAdmin,
  createAttendance,
  createCourse,
  createEnrollment,
  createGroup,
  createModule,
  createModuleEnrollment,
  createModuleSchedule,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from '../helpers/factory'

// Integration coverage for the attendance server actions — getGroupAttendance +
// bulkMarkSession (src/actions/teacher/attendance.ts) and getStudentAttendance
// (src/actions/admin/attendance.ts). The teacher/admin guards call
// notFound()/redirect() and bulkMarkSession calls revalidatePath() on success,
// so mock next/navigation (catchable NEXT_NOT_FOUND / NEXT_REDIRECT throws) and
// next/cache (revalidatePath is a no-op outside a request scope).
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { bulkMarkSession, getGroupAttendance } = await import('@/actions/teacher/attendance')
const { getStudentAttendance } = await import('@/actions/admin/attendance')

// Teachers may only mark the current month up to today, so these fixtures use
// today rather than a hardcoded date that would age out of the window.
const MARK_DATE = zagrebDateKey(new Date())

// Fixtures for the section-assembly block below. Its module windows are dated
// relative to today for the same reason, and its own school year keeps its
// holiday-free arc away from the years other files plan in.
const SECTION_YEAR = '2029/2030'
const WEEKDAYS = [
  'Nedjelja',
  'Ponedjeljak',
  'Utorak',
  'Srijeda',
  'Četvrtak',
  'Petak',
  'Subota',
] as const

/** UTC midnight `days` from today — the shape a `@db.Date` column compares on. */
function dayOffset(days: number): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days))
}

const toKey = (d: Date) => d.toISOString().slice(0, 10)

// Roster scoping — migrated from the C5 case ("attendance roster only includes
// own-group students") removed from tests/phase3/25-attendance.spec.ts.
describe('getGroupAttendance — roster scoping', () => {
  it("roster contains only the queried group's enrolled students", async () => {
    const teacher = await createTeacher()
    const groupA = await createGroup()
    const groupB = await createGroup()
    await createTeacherAssignment(teacher.id, groupA.id)

    const studentA = await createStudent()
    const studentB = await createStudent()
    await createEnrollment(studentA.id, groupA.id, { schoolYear: groupA.schoolYear })
    await createEnrollment(studentB.id, groupB.id, { schoolYear: groupB.schoolYear })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await getGroupAttendance(groupA.id)

    const rosterIds = result.roster.map((r) => r.studentId)
    expect(rosterIds, "group A's student is on the roster").toContain(studentA.id)
    expect(
      rosterIds,
      "group B's student does NOT leak into group A's roster",
    ).not.toContain(studentB.id)
  })

  it('roster excludes an enrollment from a different school year', async () => {
    const teacher = await createTeacher()
    const group = await createGroup({ schoolYear: '2026/2027' })
    await createTeacherAssignment(teacher.id, group.id)

    const current = await createStudent()
    const pastYear = await createStudent()
    await createEnrollment(current.id, group.id, { schoolYear: '2026/2027' })
    await createEnrollment(pastYear.id, group.id, { schoolYear: '2025/2026' })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await getGroupAttendance(group.id)

    const rosterIds = result.roster.map((r) => r.studentId)
    expect(rosterIds).toContain(current.id)
    expect(
      rosterIds,
      'a prior-year enrollment in the same group is excluded',
    ).not.toContain(pastYear.id)
  })

  it('throws NEXT_NOT_FOUND when the teacher is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    mockSession({ id: teacher.id, role: 'TEACHER' })

    await expect(getGroupAttendance(group.id)).rejects.toThrow(/NEXT_NOT_FOUND/)
  })
})

describe('bulkMarkSession — session marking', () => {
  it('creates an Attendance row for every entry in the roster', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)

    const studentA = await createStudent()
    const studentB = await createStudent()
    const enrollmentA = await createEnrollment(studentA.id, group.id, {
      schoolYear: group.schoolYear,
    })
    const enrollmentB = await createEnrollment(studentB.id, group.id, {
      schoolYear: group.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MARK_DATE,
      entries: [
        { enrollmentId: enrollmentA.id, present: true },
        { enrollmentId: enrollmentB.id, present: false, note: 'Bolestan' },
      ],
    })
    expect(result.success).toBe(true)

    const rowA = await db.attendance.findFirst({ where: { enrollmentId: enrollmentA.id } })
    const rowB = await db.attendance.findFirst({ where: { enrollmentId: enrollmentB.id } })
    expect(rowA).toMatchObject({ present: true, recordedById: teacher.id })
    expect(rowB).toMatchObject({ present: false, note: 'Bolestan', recordedById: teacher.id })
  })

  it('upserts in place when the same session is re-marked (no duplicate row)', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, {
      schoolYear: group.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const first = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MARK_DATE,
      entries: [{ enrollmentId: enrollment.id, present: true }],
    })
    expect(first.success).toBe(true)

    const second = await bulkMarkSession({
      groupId: group.id,
      sessionDate: MARK_DATE,
      entries: [{ enrollmentId: enrollment.id, present: false, note: 'Stigao kasno' }],
    })
    expect(second.success).toBe(true)

    const rows = await db.attendance.findMany({ where: { enrollmentId: enrollment.id } })
    expect(rows, 're-marking the same date updates the row in place').toHaveLength(1)
    expect(rows[0]).toMatchObject({ present: false, note: 'Stigao kasno' })
  })

  it('rejects entries whose enrollment belongs to another group', async () => {
    const teacher = await createTeacher()
    const ownGroup = await createGroup()
    await createTeacherAssignment(teacher.id, ownGroup.id)

    const otherGroup = await createGroup()
    const outsider = await createStudent()
    const foreignEnrollment = await createEnrollment(outsider.id, otherGroup.id, {
      schoolYear: otherGroup.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    const result = await bulkMarkSession({
      groupId: ownGroup.id,
      sessionDate: MARK_DATE,
      entries: [{ enrollmentId: foreignEnrollment.id, present: true }],
    })

    expect(result).toEqual({
      success: false,
      error: 'Neki upisi ne pripadaju ovoj grupi ili školskoj godini.',
    })
    const written = await db.attendance.count({ where: { enrollmentId: foreignEnrollment.id } })
    expect(written, 'the rejected session writes no attendance rows').toBe(0)
  })

  it('throws NEXT_NOT_FOUND when the teacher is not assigned to the group', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    const student = await createStudent()
    const enrollment = await createEnrollment(student.id, group.id, {
      schoolYear: group.schoolYear,
    })

    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(
      bulkMarkSession({
        groupId: group.id,
        sessionDate: MARK_DATE,
        entries: [{ enrollmentId: enrollment.id, present: true }],
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })
})

describe('getStudentAttendance — admin query', () => {
  it('aggregates present/absent counts per enrollment', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    const student = await createStudent()

    const groupA = await createGroup()
    const groupB = await createGroup()
    const enrollmentA = await createEnrollment(student.id, groupA.id, {
      schoolYear: groupA.schoolYear,
    })
    const enrollmentB = await createEnrollment(student.id, groupB.id, {
      schoolYear: groupB.schoolYear,
    })

    await createAttendance(enrollmentA.id, teacher.id, {
      sessionDate: new Date('2026-03-02'),
      present: true,
    })
    await createAttendance(enrollmentA.id, teacher.id, {
      sessionDate: new Date('2026-03-09'),
      present: true,
    })
    await createAttendance(enrollmentA.id, teacher.id, {
      sessionDate: new Date('2026-03-16'),
      present: false,
    })
    await createAttendance(enrollmentB.id, teacher.id, {
      sessionDate: new Date('2026-03-03'),
      present: true,
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const result = await getStudentAttendance(student.id)

    expect(result).toHaveLength(2)
    const a = result.find((e) => e.groupId === groupA.id)
    const b = result.find((e) => e.groupId === groupB.id)
    expect(a?.presentCount).toBe(2)
    expect(a?.absentCount).toBe(1)
    expect(a?.rows).toHaveLength(3)
    expect(b?.presentCount).toBe(1)
    expect(b?.absentCount).toBe(0)
    expect(b?.rows).toHaveLength(1)
  })

  it("excludes other students' enrollments and attendance", async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()

    const target = await createStudent()
    const other = await createStudent()
    const targetGroup = await createGroup()
    const otherGroup = await createGroup()
    const targetEnrollment = await createEnrollment(target.id, targetGroup.id, {
      schoolYear: targetGroup.schoolYear,
    })
    const otherEnrollment = await createEnrollment(other.id, otherGroup.id, {
      schoolYear: otherGroup.schoolYear,
    })

    await createAttendance(targetEnrollment.id, teacher.id, {
      sessionDate: new Date('2026-03-02'),
    })
    await createAttendance(otherEnrollment.id, teacher.id, {
      sessionDate: new Date('2026-03-02'),
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const result = await getStudentAttendance(target.id)

    expect(result).toHaveLength(1)
    expect(result[0].enrollmentId).toBe(targetEnrollment.id)
    expect(
      result.some((e) => e.enrollmentId === otherEnrollment.id),
      "another student's enrollment must not leak into the result",
    ).toBe(false)
  })

  it('throws NEXT_REDIRECT for a non-admin caller', async () => {
    const teacher = await createTeacher()
    const student = await createStudent()

    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(getStudentAttendance(student.id)).rejects.toThrow(/NEXT_REDIRECT/)
  })
})

// The standard branch assembles the Dolazak screen: one section per module with
// its own expected dates and its own enrolled roster, a bucket for dates that
// belong to no session, and the date the screen opens on. Only the roster half
// was covered above — the assembly itself had no test at any tier, and every
// part of it fails quietly (a date filed under the wrong module still saves).
describe('getGroupAttendance — standard-branch section assembly', () => {
  /**
   * A group whose Modul 1 finished a week ago and whose Modul 2 has no dates.
   * Anchored on today so the arc keeps straddling the present as the calendar
   * moves; the weekday is read off today for the same reason.
   */
  async function seedSectionedGroup() {
    const teacher = await createTeacher()
    const course = await createCourse({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
    const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
    // Seven weekly sessions from 49 days ago: the last one fell a week ago.
    const schedule = await createModuleSchedule(m1.id, {
      schoolYear: SECTION_YEAR,
      startDate: dayOffset(-49),
      endDate: dayOffset(-7),
    })
    const group = await createGroup({
      courseId: course.id,
      schoolYear: SECTION_YEAR,
      city: 'SPLIT',
      dayOfWeek: WEEKDAYS[dayOffset(0).getUTCDay()],
    })
    await createTeacherAssignment(teacher.id, group.id)

    const enrolled = await createStudent()
    const notInModule = await createStudent()
    const enrolledEnrollment = await createEnrollment(enrolled.id, group.id, {
      schoolYear: SECTION_YEAR,
    })
    const otherEnrollment = await createEnrollment(notInModule.id, group.id, {
      schoolYear: SECTION_YEAR,
    })
    await createModuleEnrollment(enrolledEnrollment.id, schedule.id)

    mockSession({ id: teacher.id, role: 'TEACHER' })
    return { teacher, group, m1, m2, schedule, enrolledEnrollment, otherEnrollment }
  }

  it('gives each module its own section, and an undated one a placeholder', async () => {
    const { group, m1, m2, schedule } = await seedSectionedGroup()

    const result = await getGroupAttendance(group.id)
    if (result.kind !== 'standard') throw new Error('expected the standard branch')

    expect(result.sections).toHaveLength(2)
    const [first, second] = result.sections
    expect(first.moduleId).toBe(m1.id)
    expect(first.moduleScheduleId).toBe(schedule.id)
    expect(first.expectedSessions).toHaveLength(7)
    expect(first.firstSession).toBe(toKey(dayOffset(-49)))
    expect(first.lastSession).toBe(toKey(dayOffset(-7)))
    // Modul 2 has no ModuleSchedule for this year, so it is a placeholder: the
    // teacher still sees the module exists, with nothing to mark under it.
    expect(second.moduleId).toBe(m2.id)
    expect(second.moduleScheduleId).toBeNull()
    expect(second.expectedSessions).toEqual([])
    expect(second.firstSession).toBeNull()
    expect(second.enrolledEnrollmentIds).toEqual([])
  })

  it('lists under a module only the enrollments billed to it', async () => {
    const { group, enrolledEnrollment, otherEnrollment } = await seedSectionedGroup()

    const result = await getGroupAttendance(group.id)
    if (result.kind !== 'standard') throw new Error('expected the standard branch')

    // Both children are on the group roster; only the one with a
    // ModuleEnrollment for this module belongs to its section.
    expect(result.roster).toHaveLength(2)
    expect(result.sections[0].enrolledEnrollmentIds).toEqual([enrolledEnrollment.id])
    expect(result.sections[0].enrolledEnrollmentIds).not.toContain(otherEnrollment.id)
  })

  it('files an off-schedule date under the module it fell inside, and a stray one under Ostali termini', async () => {
    const { teacher, group, enrolledEnrollment } = await seedSectionedGroup()
    // Tuesday-ish make-up inside Modul 1's window, plus a date from long before
    // the arc began.
    const insideWindow = dayOffset(-45)
    const wayOutside = dayOffset(-200)
    await createAttendance(enrolledEnrollment.id, teacher.id, { sessionDate: insideWindow })
    await createAttendance(enrolledEnrollment.id, teacher.id, { sessionDate: wayOutside })

    const result = await getGroupAttendance(group.id)
    if (result.kind !== 'standard') throw new Error('expected the standard branch')

    expect(result.sections[0].adhocSessions).toContain(toKey(insideWindow))
    expect(result.otherDates).toContain(toKey(wayOutside))
    // A date cannot be in both places — that is the whole point of bucketing.
    expect(result.otherDates).not.toContain(toKey(insideWindow))
    expect(result.sections[0].adhocSessions).not.toContain(toKey(wayOutside))
  })

  it('opens on the most recent session that has already happened', async () => {
    const { group } = await seedSectionedGroup()

    const result = await getGroupAttendance(group.id)
    if (result.kind !== 'standard') throw new Error('expected the standard branch')

    // Modul 1 ended a week ago and Modul 2 has no dates, so the newest session
    // behind us is the one a teacher is most likely still filling in.
    expect(result.defaultSelectedDate).toBe(toKey(dayOffset(-7)))
  })
})
