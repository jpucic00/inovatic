import { describe, expect, it, vi, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createInquiry,
  createModule,
  createModuleEnrollment,
  createModuleSchedule,
  createStudent,
} from './helpers/factory'

// City scoping (PR3) over students, enrollments, and payments: a SIBENIK
// admin must see/mutate only SIBENIK rows — Split rows answer exactly like
// nonexistent ones — and the same calls succeed against own-city rows.
// Assertions are pinned to rows created here (never global counts); the suite
// runs serially against a shared DB with residue from other files.

// The admin actions call revalidatePath on success. next/cache is a no-op
// outside a request scope; stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// @/actions/admin/inquiry pulls in next/headers via the school-year cookie;
// stub it so importing the module never touches a request scope.
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: () => undefined })),
}))

beforeAll(() => {
  // createStudentFromInquiry sends credentials via Resend when RESEND_API_KEY
  // is present; clear it so the action skips the send.
  delete process.env.RESEND_API_KEY
})

const {
  addEnrollment,
  createStudentFromInquiry,
  deleteEnrollment,
  deleteStudent,
  getStudent,
  getStudents,
  removeModuleEnrollment,
} = await import('@/actions/admin/student')
const { setEnrollmentYearPaid, setModulePaid } = await import('@/actions/admin/payment')
const { addModuleEnrollment, deleteModuleEnrollment } = await import(
  '@/actions/admin/module-enrollment'
)
const { getStudentAttendance } = await import('@/actions/admin/attendance')
const { getReturningStudentInfo } = await import('@/actions/admin/inquiry')

let seq = 0
const uniqueName = () => `Cityscope${Date.now().toString(36)}${(++seq).toString(36)}`

async function sibenikAdminSession() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

/** Split student enrolled in a Split group, with one module enrollment. */
async function splitStudentWithModuleEnrollment() {
  const student = await createStudent({ city: 'SPLIT' })
  const course = await createCourse()
  const group = await createGroup({ courseId: course.id, city: 'SPLIT' })
  const enrollment = await createEnrollment(student.id, group.id, {
    schoolYear: group.schoolYear,
  })
  const mod = await createModule(course.id)
  const schedule = await createModuleSchedule(mod.id, {
    schoolYear: group.schoolYear,
    city: 'SPLIT',
  })
  const moduleEnrollment = await createModuleEnrollment(enrollment.id, schedule.id)
  return { student, course, group, enrollment, schedule, moduleEnrollment }
}

describe('getStudents / getStudent — city-scoped listing and detail', () => {
  it('hides Split students from a Šibenik admin list and shows own-city ones', async () => {
    const splitName = uniqueName()
    const sibenikName = uniqueName()
    await createStudent({ city: 'SPLIT', lastName: splitName })
    const sibenikStudent = await createStudent({ city: 'SIBENIK', lastName: sibenikName })
    await sibenikAdminSession()

    const crossCity = await getStudents({ search: splitName })
    expect(crossCity.data).toHaveLength(0)

    const ownCity = await getStudents({ search: sibenikName })
    expect(ownCity.data.map((s) => s.id)).toEqual([sibenikStudent.id])
  })

  it('404s the student detail for a cross-city id, serves it same-city', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    await sibenikAdminSession()

    await expect(getStudent(splitStudent.id)).rejects.toThrow()

    const detail = await getStudent(sibenikStudent.id)
    expect(detail?.id).toBe(sibenikStudent.id)
  })

  it('404s the attendance read for a cross-city student', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(getStudentAttendance(splitStudent.id)).rejects.toThrow()
  })
})

describe('deleteStudent / deleteEnrollment — cross-city immutability', () => {
  it('404s deleting a Split student and leaves the row intact', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(deleteStudent(splitStudent.id)).rejects.toThrow()
    const stillThere = await db.user.findUnique({ where: { id: splitStudent.id } })
    expect(stillThere).not.toBeNull()
  })

  it('deletes an own-city student', async () => {
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    await sibenikAdminSession()

    const res = await deleteStudent(sibenikStudent.id)
    expect(res.success).toBe(true)
    const gone = await db.user.findUnique({ where: { id: sibenikStudent.id } })
    expect(gone).toBeNull()
  })

  it('reports a cross-city enrollment as not found and leaves it intact', async () => {
    const { enrollment } = await splitStudentWithModuleEnrollment()
    await sibenikAdminSession()

    const res = await deleteEnrollment(enrollment.id)
    expect(res).toEqual({ success: false, error: 'Upis nije pronađen.' })
    const stillThere = await db.enrollment.findUnique({ where: { id: enrollment.id } })
    expect(stillThere).not.toBeNull()
  })
})

describe('addEnrollment — both ends must be in the admin city', () => {
  it('rejects a cross-city student', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })
    await sibenikAdminSession()

    const res = await addEnrollment({ studentId: splitStudent.id, groupId: sibenikGroup.id })
    expect(res).toEqual({ success: false, error: 'Učenik nije pronađen.' })
  })

  it('rejects a cross-city group', async () => {
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    const splitGroup = await createGroup({ city: 'SPLIT' })
    await sibenikAdminSession()

    const res = await addEnrollment({ studentId: sibenikStudent.id, groupId: splitGroup.id })
    expect(res).toEqual({ success: false, error: 'Grupa nije pronađena.' })
    const rows = await db.enrollment.count({
      where: { userId: sibenikStudent.id, scheduledGroupId: splitGroup.id },
    })
    expect(rows).toBe(0)
  })

  it('enrolls an own-city student into an own-city group', async () => {
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })
    await sibenikAdminSession()

    const res = await addEnrollment({ studentId: sibenikStudent.id, groupId: sibenikGroup.id })
    expect(res.success).toBe(true)
    const row = await db.enrollment.findFirst({
      where: { userId: sibenikStudent.id, scheduledGroupId: sibenikGroup.id },
    })
    expect(row).not.toBeNull()
  })
})

describe('createStudentFromInquiry — inquiry and group city pairing', () => {
  it('reads a Split inquiry as nonexistent for a Šibenik admin', async () => {
    const splitInquiry = await createInquiry({ city: 'SPLIT' })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })
    await sibenikAdminSession()

    // Dialog-driven action: keeps the error-result contract instead of
    // throwing notFound(); the message matches the missing-id path exactly.
    const result = await createStudentFromInquiry(splitInquiry.id, sibenikGroup.id)
    expect(result).toEqual({ success: false, error: 'Upit nije pronađen.' })
    const fresh = await db.inquiry.findUnique({ where: { id: splitInquiry.id } })
    expect(fresh?.status).toBe('NEW')
  })

  it('rejects a group from the other city and rolls the inquiry back to NEW', async () => {
    const childLastName = uniqueName()
    const inquiry = await createInquiry({ city: 'SIBENIK', childLastName })
    const splitGroup = await createGroup({ city: 'SPLIT' })
    await sibenikAdminSession()

    const res = await createStudentFromInquiry(inquiry.id, splitGroup.id)
    expect(res).toEqual({ success: false, error: 'Odabrana grupa je u drugom gradu.' })

    const fresh = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(fresh?.status).toBe('NEW')
    const created = await db.user.findFirst({ where: { lastName: childLastName } })
    expect(created).toBeNull()
  })

  it('creates the account stamped with the inquiry city on the happy path', async () => {
    const childLastName = uniqueName()
    const inquiry = await createInquiry({ city: 'SIBENIK', childLastName })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })
    await sibenikAdminSession()

    const res = await createStudentFromInquiry(inquiry.id, sibenikGroup.id)
    expect(res.success).toBe(true)
    if (!res.success) return

    const created = await db.user.findUnique({ where: { id: res.studentId } })
    expect(created?.city).toBe('SIBENIK')
    const enrollment = await db.enrollment.findFirst({
      where: { userId: res.studentId, scheduledGroupId: sibenikGroup.id },
    })
    expect(enrollment).not.toBeNull()
  })

  it('blocks a cross-city identity match with the escalation error and leaks nothing', async () => {
    const firstName = 'Marta'
    const lastName = uniqueName()
    const dateOfBirth = '2016-04-03'
    const splitTwin = await createStudent({ city: 'SPLIT', firstName, lastName, dateOfBirth })
    const inquiry = await createInquiry({
      city: 'SIBENIK',
      childFirstName: firstName,
      childLastName: lastName,
      childDateOfBirth: dateOfBirth,
    })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })
    await sibenikAdminSession()

    const res = await createStudentFromInquiry(inquiry.id, sibenikGroup.id)
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error).toBe(
      'Dijete s ovim podacima već postoji u drugom gradu. Obratite se vlasniku udruge za ručno rješavanje.',
    )
    // The failure shape carries no account data — the other city's username
    // and password never leave the server.
    const leaked = JSON.stringify(res)
    expect(leaked).not.toContain(splitTwin.username ?? 'unreachable')
    expect(leaked).not.toContain(splitTwin.plainPassword)

    // Nothing was created or reused: the Split account is untouched and the
    // inquiry rolled back to NEW.
    const fresh = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(fresh?.status).toBe('NEW')
    expect(fresh?.studentId).toBeNull()
    const matches = await db.user.findMany({ where: { lastName } })
    expect(matches.map((u) => u.id)).toEqual([splitTwin.id])
  })
})

describe('getReturningStudentInfo — cross-city match is masked', () => {
  it('returns the neutral masked shape for a cross-city identity match', async () => {
    const firstName = 'Petra'
    const lastName = uniqueName()
    const dateOfBirth = '2015-09-21'
    const splitStudent = await createStudent({ city: 'SPLIT', firstName, lastName, dateOfBirth })
    const group = await createGroup({ city: 'SPLIT' })
    await createEnrollment(splitStudent.id, group.id, { schoolYear: group.schoolYear })
    await sibenikAdminSession()

    const info = await getReturningStudentInfo({ firstName, lastName, dateOfBirth })
    expect(info).toEqual({
      id: '',
      firstName: 'postojeći polaznik',
      lastName: '(druga lokacija)',
      dateOfBirth: null,
      history: [],
    })
  })

  it('returns the full info for a same-city match', async () => {
    const firstName = 'Petra'
    const lastName = uniqueName()
    const dateOfBirth = '2015-09-21'
    const sibenikStudent = await createStudent({
      city: 'SIBENIK',
      firstName,
      lastName,
      dateOfBirth,
    })
    await sibenikAdminSession()

    const info = await getReturningStudentInfo({ firstName, lastName, dateOfBirth })
    expect(info?.id).toBe(sibenikStudent.id)
    expect(info?.lastName).toBe(lastName)
  })
})

describe('payments — resolved through the enrollment group city', () => {
  it('rejects the year-paid toggle on a cross-city enrollment', async () => {
    const { enrollment } = await splitStudentWithModuleEnrollment()
    await sibenikAdminSession()

    const res = await setEnrollmentYearPaid(enrollment.id, true)
    expect(res).toEqual({ success: false, error: 'Upis nije pronađen.' })
    const fresh = await db.enrollment.findUnique({ where: { id: enrollment.id } })
    expect(fresh?.fullYearPaidAt).toBeNull()
  })

  it('rejects the module-paid toggle on a cross-city module enrollment', async () => {
    const { moduleEnrollment } = await splitStudentWithModuleEnrollment()
    await sibenikAdminSession()

    const res = await setModulePaid(moduleEnrollment.id, true)
    expect(res).toEqual({ success: false, error: 'Upis u modul nije pronađen.' })
    const fresh = await db.moduleEnrollment.findUnique({ where: { id: moduleEnrollment.id } })
    expect(fresh?.paidAt).toBeNull()
  })

  it('toggles year-paid on an own-city enrollment', async () => {
    const student = await createStudent({ city: 'SIBENIK' })
    const group = await createGroup({ city: 'SIBENIK' })
    const enrollment = await createEnrollment(student.id, group.id, {
      schoolYear: group.schoolYear,
    })
    await sibenikAdminSession()

    const res = await setEnrollmentYearPaid(enrollment.id, true)
    expect(res).toEqual({ success: true })
    const fresh = await db.enrollment.findUnique({ where: { id: enrollment.id } })
    expect(fresh?.fullYearPaidAt).not.toBeNull()
  })
})

describe('module enrollments — guarded via the enrollment group city', () => {
  it('rejects removing a cross-city module enrollment (student view)', async () => {
    const { student, moduleEnrollment } = await splitStudentWithModuleEnrollment()
    await sibenikAdminSession()

    const res = await removeModuleEnrollment(moduleEnrollment.id, student.id)
    expect(res).toEqual({ success: false, error: 'Upis u modul nije pronađen.' })
    const stillThere = await db.moduleEnrollment.findUnique({
      where: { id: moduleEnrollment.id },
    })
    expect(stillThere).not.toBeNull()
  })

  it('rejects deleting a cross-city module enrollment (group view)', async () => {
    const { moduleEnrollment } = await splitStudentWithModuleEnrollment()
    await sibenikAdminSession()

    const res = await deleteModuleEnrollment(moduleEnrollment.id)
    expect(res).toEqual({ success: false, error: 'Upis u modul nije pronađen.' })
    const stillThere = await db.moduleEnrollment.findUnique({
      where: { id: moduleEnrollment.id },
    })
    expect(stillThere).not.toBeNull()
  })

  it('rejects adding a module to a cross-city enrollment', async () => {
    const { enrollment, schedule } = await splitStudentWithModuleEnrollment()
    await sibenikAdminSession()

    const res = await addModuleEnrollment(enrollment.id, schedule.id)
    expect(res).toEqual({ success: false, error: 'Upis nije pronađen.' })
  })
})
