import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import type { EnrollmentConsents } from '@/lib/enrollment-consent'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { setEnrollmentConsents } = await import('@/actions/admin/enrollment-consent')
const { getStudents } = await import('@/actions/admin/student')
const { getGroupAttendance } = await import('@/actions/teacher/attendance')

const YEAR = '2025/2026'
const PAST = '2024/2025'

// Isolates this file's rows from everything else sharing the test DB.
const MARKER = `PRIV${Date.now().toString(36)}`

const ALL_GIVEN: EnrollmentConsents = {
  consentGallery: true,
  consentWebsite: true,
  consentSocial: true,
  consentEmail: true,
}

async function readConsents(enrollmentId: string) {
  return db.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    select: { consentGallery: true, consentWebsite: true, consentSocial: true, consentEmail: true },
  })
}

async function seedEnrollment(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const student = await createStudent({ city })
  const group = await createGroup({ city, schoolYear: YEAR })
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear: YEAR })
  return { student, group, enrollment }
}

describe('setEnrollmentConsents', () => {
  it('writes all four privole, including clearing one back to "nije uneseno"', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment()

    // A fresh enrollment has nothing entered — never a silent yes.
    expect(await readConsents(enrollment.id)).toEqual({
      consentGallery: null,
      consentWebsite: null,
      consentSocial: null,
      consentEmail: null,
    })

    const res = await setEnrollmentConsents({
      enrollmentId: enrollment.id,
      consentGallery: true,
      consentWebsite: false,
      consentSocial: false,
      consentEmail: true,
    })
    expect(res.success).toBe(true)
    expect(await readConsents(enrollment.id)).toEqual({
      consentGallery: true,
      consentWebsite: false,
      consentSocial: false,
      consentEmail: true,
    })

    const res2 = await setEnrollmentConsents({
      enrollmentId: enrollment.id,
      consentGallery: true,
      consentWebsite: null,
      consentSocial: false,
      consentEmail: true,
    })
    expect(res2.success).toBe(true)
    expect((await readConsents(enrollment.id)).consentWebsite).toBeNull()
  })

  it('refuses a cross-city enrollment like a missing one, and leaves it untouched', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment('SIBENIK')

    const res = await setEnrollmentConsents({ enrollmentId: enrollment.id, ...ALL_GIVEN })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Upis nije pronađen.')
    expect((await readConsents(enrollment.id)).consentGallery).toBeNull()
  })

  /** Owner decision: teachers read the privole, only the office enters them. */
  it('refuses a teacher, even on their own group', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })
    const { group, enrollment } = await seedEnrollment()
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })

    await expect(
      setEnrollmentConsents({ enrollmentId: enrollment.id, ...ALL_GIVEN }),
    ).rejects.toThrow()
    expect((await readConsents(enrollment.id)).consentGallery).toBeNull()
  })

  it('rejects a payload that is not Da / Ne / prazno', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const { enrollment } = await seedEnrollment()

    const res = await setEnrollmentConsents({
      enrollmentId: enrollment.id,
      ...ALL_GIVEN,
      consentWebsite: 'yes' as unknown as boolean,
    })
    expect(res.success).toBe(false)
    expect((await readConsents(enrollment.id)).consentGallery).toBeNull()
  })
})

describe('getStudents — Privole filter', () => {
  let adminId: string
  let groupAId: string
  let allGivenId: string
  let webRefusedId: string
  let webMissingId: string
  let mixedGroupsId: string
  let pastRefusalOnlyId: string

  beforeAll(async () => {
    adminId = (await createAdmin({ city: 'SPLIT' })).id
    const groupA = await createGroup({ schoolYear: YEAR })
    const groupB = await createGroup({ schoolYear: YEAR })
    const pastGroup = await createGroup({ schoolYear: PAST })
    groupAId = groupA.id

    async function enrolled(lastName: string, groupId: string, consents: EnrollmentConsents, schoolYear = YEAR) {
      const student = await createStudent({ lastName: `${MARKER}${lastName}` })
      const e = await createEnrollment(student.id, groupId, { schoolYear })
      await db.enrollment.update({ where: { id: e.id }, data: consents })
      return student.id
    }

    allGivenId = await enrolled('Sve', groupA.id, ALL_GIVEN)
    webRefusedId = await enrolled('WebNe', groupA.id, { ...ALL_GIVEN, consentWebsite: false })
    webMissingId = await enrolled('WebPrazno', groupA.id, { ...ALL_GIVEN, consentWebsite: null })

    // Web given in group A, refused in group B — the same child, two forms.
    mixedGroupsId = await enrolled('Dvije', groupA.id, ALL_GIVEN)
    const b = await createEnrollment(mixedGroupsId, groupB.id, { schoolYear: YEAR })
    await db.enrollment.update({ where: { id: b.id }, data: { ...ALL_GIVEN, consentWebsite: false } })

    // Refused last year, everything given this year.
    pastRefusalOnlyId = await enrolled('Prosla', pastGroup.id, { ...ALL_GIVEN, consentWebsite: false }, PAST)
    const cur = await createEnrollment(pastRefusalOnlyId, groupA.id, { schoolYear: YEAR })
    await db.enrollment.update({ where: { id: cur.id }, data: ALL_GIVEN })
  })

  async function ids(filters: Parameters<typeof getStudents>[0]) {
    mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
    const res = await getStudents({ search: MARKER, schoolYear: YEAR, pageSize: 100, ...filters })
    return res.data.map((r) => r.id).sort()
  }

  it('"Bez privole" counts a refusal AND a form not entered yet', async () => {
    expect(await ids({ consent: 'NO_WEBSITE' })).toEqual(
      [webRefusedId, webMissingId, mixedGroupsId].sort(),
    )
  })

  it('asks about the enrollment the group filter picked, not another group the child attends', async () => {
    expect(await ids({ consent: 'NO_WEBSITE', groupId: groupAId })).toEqual(
      [webRefusedId, webMissingId].sort(),
    )
  })

  it('"Privole nisu unesene" finds only enrollments with a blank answer', async () => {
    expect(await ids({ consent: 'MISSING' })).toEqual([webMissingId])
  })

  it('"Sve privole dane" needs every consent on some enrollment of the year', async () => {
    expect(await ids({ consent: 'ALL_GIVEN' })).toEqual(
      [allGivenId, mixedGroupsId, pastRefusalOnlyId].sort(),
    )
  })

  it('ignores last year\'s forms', async () => {
    expect(await ids({ consent: 'NO_WEBSITE' })).not.toContain(pastRefusalOnlyId)
  })
})

describe('getGroupAttendance — roster carries the privole', () => {
  it('hands each row its own enrollment\'s consents, so Dolazak can mark whom not to photograph', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })
    const course = await createCourse({ kind: 'RADIONICA' })
    const group = await createGroup({
      courseId: course.id,
      schoolYear: YEAR,
      dateStart: '2025-10-06',
      dateEnd: '2025-10-08',
    })
    await createTeacherAssignment(teacher.id, group.id)
    const student = await createStudent()
    const e = await createEnrollment(student.id, group.id, { schoolYear: YEAR })
    await db.enrollment.update({
      where: { id: e.id },
      data: { ...ALL_GIVEN, consentSocial: false, consentGallery: null },
    })

    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    const data = await getGroupAttendance(group.id)
    const row = data.roster.find((r) => r.enrollmentId === e.id)
    expect(row?.consents).toEqual({
      consentGallery: null,
      consentWebsite: true,
      consentSocial: false,
      consentEmail: true,
    })
  })
})
