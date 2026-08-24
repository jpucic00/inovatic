import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeSchoolYear, getNextSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createModule,
  createModuleEnrollment,
  createModuleSchedule,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getStudents } = await import('@/actions/admin/student')

const CY = computeSchoolYear() // current school year as of today
const PAST = '2024/2025'
// The year admins enrol into over the summer, while the calendar still names
// the one that is ending. Everything about the reported bug lives in that gap.
const NEXT = getNextSchoolYear(CY)
const NOT_STARTED = new Date('2099-09-01T00:00:00.000Z')
// Started-in-the-past schedule so the PAST-year student carries a PENDING debt
// status — lets the combined schoolYear + paymentStatus case below be meaningful.
const PAST_STARTED = new Date('2024-10-01T00:00:00.000Z')

// Shared marker isolates this file's students from anything else in the test DB.
const MARKER = `YRSTU${Date.now().toString(36)}`

let cyStudentId: string
let pastStudentId: string
let nextStudentId: string
let unenrolledStudentId: string
let adminId: string

beforeAll(async () => {
  const admin = await createAdmin()
  adminId = admin.id

  const cyStudent = await createStudent({ lastName: `${MARKER}Tekuca` })
  const cyGroup = await createGroup({ schoolYear: CY })
  await createEnrollment(cyStudent.id, cyGroup.id, { schoolYear: CY })
  cyStudentId = cyStudent.id

  // Past-year student with an unpaid module schedule that already started, so
  // its computed payment status is PENDING (cross-year debt).
  const pastStudent = await createStudent({ lastName: `${MARKER}Prosla` })
  const pastCourse = await createCourse()
  const pastModule = await createModule(pastCourse.id)
  const pastSchedule = await createModuleSchedule(pastModule.id, {
    schoolYear: PAST,
    startDate: PAST_STARTED,
  })
  const pastGroup = await createGroup({ courseId: pastCourse.id, schoolYear: PAST })
  const pastEnr = await createEnrollment(pastStudent.id, pastGroup.id, { schoolYear: PAST })
  await createModuleEnrollment(pastEnr.id, pastSchedule.id)
  pastStudentId = pastStudent.id

  // Enrolled for the coming year, whose modules have not begun: the exact shape
  // that used to read "Bez upisa" on a list keyed to today's date.
  const nextStudent = await createStudent({ lastName: `${MARKER}Sljedeca` })
  const nextCourse = await createCourse()
  const nextModule = await createModule(nextCourse.id)
  const nextSchedule = await createModuleSchedule(nextModule.id, {
    schoolYear: NEXT,
    startDate: NOT_STARTED,
  })
  const nextGroup = await createGroup({ courseId: nextCourse.id, schoolYear: NEXT })
  const nextEnr = await createEnrollment(nextStudent.id, nextGroup.id, { schoolYear: NEXT })
  await createModuleEnrollment(nextEnr.id, nextSchedule.id)
  nextStudentId = nextStudent.id

  // An account with no enrollment anywhere — a workbook import, or an upit
  // accepted before a group was picked.
  unenrolledStudentId = (await createStudent({ lastName: `${MARKER}BezUpisa` })).id
})

// setup.ts resets the auth mock to null after every test, so re-arm per test.
beforeEach(() => {
  mockSession({ id: adminId, role: 'ADMIN' })
})

async function fetchIds(filters: Parameters<typeof getStudents>[0]) {
  const res = await getStudents({ ...filters, search: MARKER, pageSize: 100 })
  return new Set(res.data.map((r) => r.id))
}

describe('getStudents — schoolYear filter', () => {
  it('returns every marked student when no year is set', async () => {
    const ids = await fetchIds({})
    expect(ids.has(cyStudentId)).toBe(true)
    expect(ids.has(pastStudentId)).toBe(true)
  })

  it('narrows to a single year, excluding enrollees of other years', async () => {
    const ids = await fetchIds({ schoolYear: CY })
    expect(ids.has(cyStudentId)).toBe(true)
    expect(ids.has(pastStudentId)).toBe(false)
  })

  it('returns the other year when that year is selected', async () => {
    const ids = await fetchIds({ schoolYear: PAST })
    expect(ids.has(pastStudentId)).toBe(true)
    expect(ids.has(cyStudentId)).toBe(false)
  })

  it('drops a student with no enrollment at all from every year', async () => {
    // The trade the year scope makes: an account nobody enrolled is not in any
    // year's list. It is still reachable by id, and by /admin/ucenici once the
    // child is put in a group.
    expect((await fetchIds({ schoolYear: CY })).has(unenrolledStudentId)).toBe(false)
    expect((await fetchIds({ schoolYear: PAST })).has(unenrolledStudentId)).toBe(false)
    // …and is still there when nothing is scoping the list.
    expect((await fetchIds({})).has(unenrolledStudentId)).toBe(true)
  })

  it('combines with paymentStatus without the enrollments/AND filters colliding', async () => {
    // schoolYear rides the enrollments.some spread; paymentStatus is AND-wrapped.
    // The past-year student has a started, unpaid module → PENDING in its year.
    const ids = await fetchIds({ schoolYear: PAST, paymentStatus: 'PENDING' })
    expect(ids.has(pastStudentId)).toBe(true)
    expect(ids.has(cyStudentId)).toBe(false)
  })
})

describe('getStudents — payment status follows the year being viewed', () => {
  async function statusOf(id: string, filters: Parameters<typeof getStudents>[0]) {
    const res = await getStudents({ ...filters, search: MARKER, pageSize: 100 })
    return res.data.find((r) => r.id === id)?.paymentStatus
  }

  it('reads NOT_DUE for a child enrolled in a year that has not started', async () => {
    // Enrolled, nothing owed, nothing paid. "Bez upisa" here was the bug: it
    // said the child had no place in a year they had just been signed up for.
    expect(await statusOf(nextStudentId, { schoolYear: NEXT })).toBe('NOT_DUE')
  })

  it('still reads NONE for that child when a DIFFERENT year is in view', async () => {
    // Not a regression — against CY the statement is true, and the row only
    // appears at all because this call scopes to no year.
    expect(await statusOf(nextStudentId, {})).toBe('NONE')
  })

  it('keeps a cross-year debt visible from inside a settled year', async () => {
    // PENDING stays year-independent on purpose: money owed for an earlier year
    // follows the family into the one being looked at.
    expect(await statusOf(pastStudentId, { schoolYear: PAST })).toBe('PENDING')
  })
})
