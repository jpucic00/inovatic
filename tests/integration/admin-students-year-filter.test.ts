import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeSchoolYear } from '@/lib/school-year'
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
// Started-in-the-past schedule so the PAST-year student carries a PENDING debt
// status — lets the combined schoolYear + paymentStatus case below be meaningful.
const PAST_STARTED = new Date('2024-10-01T00:00:00.000Z')

// Shared marker isolates this file's students from anything else in the test DB.
const MARKER = `YRSTU${Date.now().toString(36)}`

let cyStudentId: string
let pastStudentId: string
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

  it('combines with paymentStatus without the enrollments/AND filters colliding', async () => {
    // schoolYear rides the enrollments.some spread; paymentStatus is AND-wrapped.
    // The past-year student has a started, unpaid module → PENDING in its year.
    const ids = await fetchIds({ schoolYear: PAST, paymentStatus: 'PENDING' })
    expect(ids.has(pastStudentId)).toBe(true)
    expect(ids.has(cyStudentId)).toBe(false)
  })
})
