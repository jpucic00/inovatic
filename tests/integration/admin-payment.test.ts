import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
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
  createTeacher,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { setModulePaid, setEnrollmentYearPaid } = await import('@/actions/admin/payment')
const { getStudents } = await import('@/actions/admin/student')

const CY = computeSchoolYear() // current school year as of today
const PAST = '2024/2025'

const STARTED = new Date('2025-10-01T00:00:00.000Z') // before today (2026-06-13)
const FUTURE = new Date('2026-12-01T00:00:00.000Z') // after today
const PAST_STARTED = new Date('2024-10-01T00:00:00.000Z')

describe('setModulePaid', () => {
  it('marks a module paid and then unpaid (admin)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const student = await createStudent()
    const course = await createCourse()
    const mod = await createModule(course.id)
    const ms = await createModuleSchedule(mod.id, { schoolYear: CY, startDate: STARTED })
    const group = await createGroup({ courseId: course.id, schoolYear: CY })
    const enr = await createEnrollment(student.id, group.id, { schoolYear: CY })
    const me = await createModuleEnrollment(enr.id, ms.id)

    const res = await setModulePaid(me.id, true)
    expect(res.success).toBe(true)
    expect((await db.moduleEnrollment.findUnique({ where: { id: me.id } }))?.paidAt).not.toBeNull()

    const res2 = await setModulePaid(me.id, false)
    expect(res2.success).toBe(true)
    expect((await db.moduleEnrollment.findUnique({ where: { id: me.id } }))?.paidAt).toBeNull()
  })

  it('returns failure for an unknown module enrollment id', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await setModulePaid('does-not-exist', true)
    expect(res.success).toBe(false)
  })

  it('rejects a teacher', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(setModulePaid('whatever', true)).rejects.toThrow()
  })

  it('rejects an anonymous caller', async () => {
    mockSession(null)
    await expect(setModulePaid('whatever', true)).rejects.toThrow()
  })
})

describe('setEnrollmentYearPaid', () => {
  it('marks an enrollment year paid and then unpaid (admin)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const student = await createStudent()
    const group = await createGroup({ schoolYear: CY })
    const enr = await createEnrollment(student.id, group.id, { schoolYear: CY })

    const res = await setEnrollmentYearPaid(enr.id, true)
    expect(res.success).toBe(true)
    expect((await db.enrollment.findUnique({ where: { id: enr.id } }))?.fullYearPaidAt).not.toBeNull()

    const res2 = await setEnrollmentYearPaid(enr.id, false)
    expect(res2.success).toBe(true)
    expect((await db.enrollment.findUnique({ where: { id: enr.id } }))?.fullYearPaidAt).toBeNull()
  })

  it('returns failure for an unknown enrollment id', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await setEnrollmentYearPaid('does-not-exist', true)
    expect(res.success).toBe(false)
  })

  it('rejects a teacher', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER' })
    await expect(setEnrollmentYearPaid('whatever', true)).rejects.toThrow()
  })

  it('rejects an anonymous caller', async () => {
    mockSession(null)
    await expect(setEnrollmentYearPaid('whatever', true)).rejects.toThrow()
  })
})

describe('getStudents payment filter + computed status', () => {
  const MARKER = 'PAYFILTERZ'
  const ids: Record<string, string> = {}
  let courseX: string
  let adminId: string

  // Build a standard-course enrollment with one module of a given (startDate, paid).
  async function standardStudent(
    key: string,
    opts: {
      schoolYear: string
      startDate: Date | null
      paid: boolean
      yearPaid?: boolean
      courseId?: string
    },
  ) {
    const s = await createStudent({ lastName: `${MARKER}_${key}` })
    const courseId = opts.courseId ?? (await createCourse()).id
    const mod = await createModule(courseId)
    const ms = await createModuleSchedule(mod.id, {
      schoolYear: opts.schoolYear,
      startDate: opts.startDate,
    })
    const group = await createGroup({ courseId, schoolYear: opts.schoolYear })
    const enr = await createEnrollment(s.id, group.id, {
      schoolYear: opts.schoolYear,
      fullYearPaidAt: opts.yearPaid ? new Date() : null,
    })
    await createModuleEnrollment(enr.id, ms.id, { paidAt: opts.paid ? new Date() : null })
    ids[key] = s.id
    return s.id
  }

  async function radionicaStudent(key: string, opts: { paid: boolean }) {
    const s = await createStudent({ lastName: `${MARKER}_${key}` })
    const course = await createCourse({ isCustom: true })
    const group = await createGroup({ courseId: course.id, schoolYear: CY })
    await createEnrollment(s.id, group.id, {
      schoolYear: CY,
      fullYearPaidAt: opts.paid ? new Date() : null,
    })
    ids[key] = s.id
    return s.id
  }

  beforeAll(async () => {
    const admin = await createAdmin()
    adminId = admin.id
    mockSession({ id: admin.id, role: 'ADMIN' })

    courseX = (await createCourse()).id

    await standardStudent('A_pending', { schoolYear: CY, startDate: STARTED, paid: false })
    await standardStudent('B_allpaid', { schoolYear: CY, startDate: STARTED, paid: true })
    await standardStudent('C_yearpaid', {
      schoolYear: CY,
      startDate: STARTED,
      paid: false,
      yearPaid: true,
    })
    await radionicaStudent('D_radio_unpaid', { paid: false })
    await radionicaStudent('D2_radio_paid', { paid: true })
    await standardStudent('E_future', { schoolYear: CY, startDate: FUTURE, paid: false })
    await standardStudent('F_pastpaid', { schoolYear: PAST, startDate: PAST_STARTED, paid: true })
    await standardStudent('G_pastunpaid', { schoolYear: PAST, startDate: PAST_STARTED, paid: false })
    // H: pending under courseX, for the combined courseId + paymentStatus test.
    await standardStudent('H_courseX', {
      schoolYear: CY,
      startDate: STARTED,
      paid: false,
      courseId: courseX,
    })
  })

  // setup.ts resets the auth mock to null after every test; re-arm the admin
  // session before each filter assertion (data is seeded once in beforeAll).
  beforeEach(() => {
    mockSession({ id: adminId, role: 'ADMIN' })
  })

  async function fetchIds(filters: Parameters<typeof getStudents>[0]) {
    const res = await getStudents({ ...filters, search: MARKER, pageSize: 100 })
    return new Set(res.data.map((r) => r.id))
  }

  it('computes the correct status per student (no filter)', async () => {
    const res = await getStudents({ search: MARKER, pageSize: 100 })
    const byId = new Map(res.data.map((r) => [r.id, r.paymentStatus]))
    expect(byId.get(ids.A_pending)).toBe('PENDING')
    expect(byId.get(ids.B_allpaid)).toBe('PAID')
    expect(byId.get(ids.C_yearpaid)).toBe('PAID')
    expect(byId.get(ids.D_radio_unpaid)).toBe('PENDING')
    expect(byId.get(ids.D2_radio_paid)).toBe('PAID')
    expect(byId.get(ids.E_future)).toBe('PAID')
    expect(byId.get(ids.F_pastpaid)).toBe('NONE')
    expect(byId.get(ids.G_pastunpaid)).toBe('PENDING') // cross-year debt
    expect(byId.get(ids.H_courseX)).toBe('PENDING')
  })

  it('PENDING filter returns only debtors (incl. cross-year + radionica)', async () => {
    const got = await fetchIds({ paymentStatus: 'PENDING' })
    expect(got.has(ids.A_pending)).toBe(true)
    expect(got.has(ids.D_radio_unpaid)).toBe(true)
    expect(got.has(ids.G_pastunpaid)).toBe(true)
    expect(got.has(ids.H_courseX)).toBe(true)
    expect(got.has(ids.B_allpaid)).toBe(false)
    expect(got.has(ids.C_yearpaid)).toBe(false)
    expect(got.has(ids.D2_radio_paid)).toBe(false)
    expect(got.has(ids.E_future)).toBe(false)
    expect(got.has(ids.F_pastpaid)).toBe(false)
  })

  it('PAID filter returns current-year enrolled with nothing owed', async () => {
    const got = await fetchIds({ paymentStatus: 'PAID' })
    expect(got.has(ids.B_allpaid)).toBe(true)
    expect(got.has(ids.C_yearpaid)).toBe(true)
    expect(got.has(ids.D2_radio_paid)).toBe(true)
    expect(got.has(ids.E_future)).toBe(true)
    expect(got.has(ids.A_pending)).toBe(false)
    expect(got.has(ids.D_radio_unpaid)).toBe(false)
    expect(got.has(ids.G_pastunpaid)).toBe(false)
    expect(got.has(ids.F_pastpaid)).toBe(false) // NONE: no current-year enrollment
  })

  it('combines courseId with paymentStatus (AND-wrap regression)', async () => {
    const got = await fetchIds({ paymentStatus: 'PENDING', courseId: courseX })
    expect(got.has(ids.H_courseX)).toBe(true)
    // A is pending too but in a different course — the course filter must still apply.
    expect(got.has(ids.A_pending)).toBe(false)
  })
})
