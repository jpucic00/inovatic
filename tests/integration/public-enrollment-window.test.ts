import { describe, expect, it, vi, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollmentWindow,
  createGroup,
  createLocation,
} from './helpers/factory'

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
  (await getActivePrograms('SPLIT')).some((p) => p.id === id)

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

describe('getActivePrograms — city isolation under open windows', () => {
  it('a Split group under an open window never appears in the Šibenik result, and vice versa', async () => {
    // One shared course with a group AND an open window in EACH city — so the
    // only thing that can keep them apart is the city filter, not a closed
    // window or a missing program.
    const course = await createCourse({ isCustom: true, schoolYear: YEAR })
    createdCourseIds.push(course.id)

    const splitLoc = await createLocation({ city: 'SPLIT' })
    const sibLoc = await createLocation({ city: 'SIBENIK' })
    const splitGroup = await createGroup({
      courseId: course.id, locationId: splitLoc.id, city: 'SPLIT',
      schoolYear: YEAR, dateStart: '2026-07-15', dateEnd: '2026-07-21',
    })
    const sibGroup = await createGroup({
      courseId: course.id, locationId: sibLoc.id, city: 'SIBENIK',
      schoolYear: YEAR, dateStart: '2026-07-15', dateEnd: '2026-07-21',
    })

    const openRange = {
      enrollmentStart: new Date('2026-01-01'),
      enrollmentEnd: new Date('2027-12-31'),
    }
    await createEnrollmentWindow(course.id, { schoolYear: YEAR, city: 'SPLIT', ...openRange })
    await createEnrollmentWindow(course.id, { schoolYear: YEAR, city: 'SIBENIK', ...openRange })

    const splitGroupIds = (await getActivePrograms('SPLIT')).flatMap((p) => p.groups.map((g) => g.id))
    const sibGroupIds = (await getActivePrograms('SIBENIK')).flatMap((p) => p.groups.map((g) => g.id))

    expect(splitGroupIds).toContain(splitGroup.id)
    expect(splitGroupIds).not.toContain(sibGroup.id)
    expect(sibGroupIds).toContain(sibGroup.id)
    expect(sibGroupIds).not.toContain(splitGroup.id)
  })
})
