import { describe, expect, it, vi, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse, createGroup, createLocation } from './helpers/factory'

// upsertEnrollmentWindow revalidates on success — stub next/cache so the action
// body runs without a request scope.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { upsertEnrollmentWindow } = await import('@/actions/admin/enrollment-window')
const { getActivePrograms } = await import('@/actions/public/programs')

const YEAR = '2026/2027'
const createdCourseIds: string[] = []

afterAll(async () => {
  await db.courseEnrollmentWindow.deleteMany({ where: { courseId: { in: createdCourseIds } } })
  await db.scheduledGroup.deleteMany({ where: { courseId: { in: createdCourseIds } } })
  await db.course.deleteMany({ where: { id: { in: createdCourseIds } } })
})

async function setup() {
  const admin = await createAdmin()
  const course = await createCourse({ isCustom: true, schoolYear: YEAR })
  createdCourseIds.push(course.id)
  const location = await createLocation()
  await createGroup({
    courseId: course.id,
    locationId: location.id,
    schoolYear: YEAR,
    dateStart: '2026-07-15',
    dateEnd: '2026-07-21',
  })
  mockSession({ id: admin.id, role: 'ADMIN' })
  return course
}

const hasProgram = async (id: string) =>
  (await getActivePrograms()).some((p) => p.id === id)

describe('getActivePrograms — gated by the program (course, year) window', () => {
  it('hides a program that has no window for the year', async () => {
    const course = await setup()
    expect(await hasProgram(course.id)).toBe(false)
  })

  it('shows the program once an open window is set, and hides it again when closed', async () => {
    const course = await setup()

    // Open window straddling "now".
    await upsertEnrollmentWindow({
      courseId: course.id,
      schoolYear: YEAR,
      enrollmentStart: '2026-01-01',
      enrollmentEnd: '2027-12-31',
    })
    expect(await hasProgram(course.id)).toBe(true)

    // Past window → closed → hidden.
    await upsertEnrollmentWindow({
      courseId: course.id,
      schoolYear: YEAR,
      enrollmentStart: '2020-01-01',
      enrollmentEnd: '2020-02-01',
    })
    expect(await hasProgram(course.id)).toBe(false)

    // Cleared window → hidden.
    await upsertEnrollmentWindow({
      courseId: course.id,
      schoolYear: YEAR,
      enrollmentStart: '2026-01-01',
      enrollmentEnd: '2027-12-31',
    })
    expect(await hasProgram(course.id)).toBe(true)
    await upsertEnrollmentWindow({ courseId: course.id, schoolYear: YEAR })
    expect(await hasProgram(course.id)).toBe(false)
  })

  it('a window for a different school year does not open the program', async () => {
    const course = await setup()
    await upsertEnrollmentWindow({
      courseId: course.id,
      schoolYear: '2027/2028',
      enrollmentStart: '2026-01-01',
      enrollmentEnd: '2027-12-31',
    })
    expect(await hasProgram(course.id)).toBe(false)
  })
})
