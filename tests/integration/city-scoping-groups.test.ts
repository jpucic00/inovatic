import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createLocation,
  createStudent,
  createTeacher,
} from './helpers/factory'

// The group/location actions revalidate, read the school-year cookie, and the
// city guards throw notFound()/redirect() — stub the next integrations so the
// action bodies run without a request scope and 404s become catchable throws.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    const err = new Error('NEXT_NOT_FOUND')
    ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
    throw err
  }),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  }),
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const {
  getGroups,
  getGroupDetail,
  createGroup: createGroupAction,
  updateGroup,
  deleteGroup,
} = await import('@/actions/admin/group')
const { getLocations, createLocation: createLocationAction, deleteLocation } =
  await import('@/actions/admin/location')
const { getCourses } = await import('@/actions/admin/course')

const SY = '2026/2027'

beforeAll(async () => {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { name, value: SY } : undefined,
  })
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

// FK-safe cleanup so later files' global wipes don't hit orphaned references.
afterAll(async () => {
  await db.attendance.deleteMany({})
  await db.moduleEnrollment.deleteMany({})
  await db.enrollment.deleteMany({})
  await db.teacherAssignment.deleteMany({})
  await db.materialGroupHide.deleteMany({})
  await db.material.deleteMany({})
  await db.studentComment.deleteMany({})
  await db.studentAssessment.deleteMany({})
  await db.galleryImage.deleteMany({})
  await db.inquiry.deleteMany({})
  await db.courseEnrollmentWindow.deleteMany({})
  await db.moduleSchedule.deleteMany({})
  await db.scheduledGroup.deleteMany({})
  await db.courseModule.deleteMany({})
  await db.course.deleteMany({})
  await db.location.deleteMany({})
})

async function loginSibenikAdmin() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

let radionicaCounter = 0
// The factory's createCourse has no city override yet — radionice (isCustom,
// per-city) are created directly.
function createRadionica(city: 'SPLIT' | 'SIBENIK') {
  const id = `${Date.now().toString(36)}${(++radionicaCounter).toString(36)}`
  return db.course.create({
    data: {
      slug: `radionica-${city.toLowerCase()}-${id}`,
      title: `Radionica ${city} ${id}`,
      description: 'Test radionica',
      ageMin: 6,
      ageMax: 14,
      isCustom: true,
      schoolYear: SY,
      city,
    },
  })
}

describe('group reads — city scoping', () => {
  it('getGroups shows own-city groups and hides the other city’s', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    await loginSibenikAdmin()

    const rows = await getGroups()
    expect(rows.some((g) => g.id === sibenikGroup.id)).toBe(true)
    expect(rows.some((g) => g.id === splitGroup.id)).toBe(false)
  })

  it('getGroupDetail throws NEXT_NOT_FOUND on a cross-city group id', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    await loginSibenikAdmin()

    await expect(getGroupDetail(splitGroup.id)).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('getGroupDetail returns an own-city group', async () => {
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    await loginSibenikAdmin()

    const detail = await getGroupDetail(sibenikGroup.id)
    expect(detail?.id).toBe(sibenikGroup.id)
  })
})

describe('createGroup — city scoping', () => {
  it('rejects a venue from the other city', async () => {
    const course = await createCourse() // shared standard program (city null)
    const splitLocation = await createLocation({ city: 'SPLIT' })
    await loginSibenikAdmin()

    const res = await createGroupAction({
      courseId: course.id,
      locationId: splitLocation.id,
      name: 'Cross-city venue attempt',
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
      maxStudents: 12,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/lokacija/i)
    expect(
      await db.scheduledGroup.findFirst({ where: { name: 'Cross-city venue attempt' } }),
    ).toBeNull()
  })

  it('rejects the other city’s radionica even at an own-city venue', async () => {
    const splitRadionica = await createRadionica('SPLIT')
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const res = await createGroupAction({
      courseId: splitRadionica.id,
      locationId: sibenikLocation.id,
      name: 'Cross-city radionica attempt',
      dateStart: '2026-10-05',
      dateEnd: '2026-10-09',
      dayOfWeek: '',
      startTime: '09:00',
      endTime: '11:00',
      maxStudents: 12,
    })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/program/i)
  })

  it('rejects assignees from the other city and non-staff roles', async () => {
    const course = await createCourse()
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const base = {
      courseId: course.id,
      locationId: sibenikLocation.id,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
      maxStudents: 12,
    } as const

    const crossCity = await createGroupAction({
      ...base,
      name: 'Cross-city assignee attempt',
      teacherIds: [splitTeacher.id],
    })
    expect(crossCity.success).toBe(false)
    if (!crossCity.success) expect(crossCity.error).toMatch(/voditelja/i)

    const studentAssignee = await createGroupAction({
      ...base,
      name: 'Student assignee attempt',
      teacherIds: [sibenikStudent.id],
    })
    expect(studentAssignee.success).toBe(false)
  })

  it('creates a group stamped with the venue city and syncs own-city staff', async () => {
    const course = await createCourse()
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    const sibenikTeacher = await createTeacher({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const name = `Trokut grupa ${Date.now().toString(36)}`
    const res = await createGroupAction({
      courseId: course.id,
      locationId: sibenikLocation.id,
      name,
      dayOfWeek: 'Utorak',
      startTime: '17:00',
      endTime: '18:30',
      maxStudents: 12,
      teacherIds: [sibenikTeacher.id],
    })
    expect(res).toEqual({ success: true })

    const created = await db.scheduledGroup.findFirstOrThrow({ where: { name } })
    expect(created.city).toBe('SIBENIK')
    expect(
      await db.teacherAssignment.count({
        where: { scheduledGroupId: created.id, userId: sibenikTeacher.id },
      }),
    ).toBe(1)
  })
})

describe('updateGroup — city scoping', () => {
  it('throws NEXT_NOT_FOUND on a cross-city group id', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    await loginSibenikAdmin()

    await expect(
      updateGroup({ id: splitGroup.id, name: 'Hijacked' }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
    const untouched = await db.scheduledGroup.findUniqueOrThrow({ where: { id: splitGroup.id } })
    expect(untouched.name).toBe(splitGroup.name)
  })

  it('rejects moving the group to the other city’s venue', async () => {
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    const splitLocation = await createLocation({ city: 'SPLIT' })
    await loginSibenikAdmin()

    const res = await updateGroup({ id: sibenikGroup.id, locationId: splitLocation.id })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/lokacija/i)
    const unchanged = await db.scheduledGroup.findUniqueOrThrow({ where: { id: sibenikGroup.id } })
    expect(unchanged.locationId).toBe(sibenikGroup.locationId)
  })

  it('rejects syncing cross-city or non-staff assignees', async () => {
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const crossCity = await updateGroup({ id: sibenikGroup.id, teacherIds: [splitTeacher.id] })
    expect(crossCity.success).toBe(false)

    const student = await updateGroup({ id: sibenikGroup.id, teacherIds: [sibenikStudent.id] })
    expect(student.success).toBe(false)

    expect(
      await db.teacherAssignment.count({ where: { scheduledGroupId: sibenikGroup.id } }),
    ).toBe(0)
  })

  it('syncs an own-city teacher', async () => {
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    const sibenikTeacher = await createTeacher({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const res = await updateGroup({ id: sibenikGroup.id, teacherIds: [sibenikTeacher.id] })
    expect(res).toEqual({ success: true })
    expect(
      await db.teacherAssignment.count({
        where: { scheduledGroupId: sibenikGroup.id, userId: sibenikTeacher.id },
      }),
    ).toBe(1)
  })
})

describe('deleteGroup — city scoping', () => {
  it('throws NEXT_NOT_FOUND on a cross-city id and leaves the row', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    await loginSibenikAdmin()

    await expect(deleteGroup(splitGroup.id)).rejects.toThrow(/NEXT_NOT_FOUND/)
    expect(
      await db.scheduledGroup.findUnique({ where: { id: splitGroup.id } }),
    ).not.toBeNull()
  })

  it('deletes an own-city group', async () => {
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    await loginSibenikAdmin()

    const res = await deleteGroup(sibenikGroup.id)
    expect(res).toEqual({ success: true })
    expect(
      await db.scheduledGroup.findUnique({ where: { id: sibenikGroup.id } }),
    ).toBeNull()
  })
})

describe('locations — city scoping', () => {
  it('getLocations hides the other city’s venues', async () => {
    const splitLocation = await createLocation({ city: 'SPLIT' })
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const rows = await getLocations()
    expect(rows.some((l) => l.id === sibenikLocation.id)).toBe(true)
    expect(rows.some((l) => l.id === splitLocation.id)).toBe(false)
  })

  it('createLocation stamps the admin session city', async () => {
    await loginSibenikAdmin()

    const name = `Trokut inkubator ${Date.now().toString(36)}`
    const res = await createLocationAction({
      name,
      address: 'Obala palih omladinaca 2, Šibenik',
      phone: '',
      email: '',
    })
    expect(res).toEqual({ success: true })

    const created = await db.location.findFirstOrThrow({ where: { name } })
    expect(created.city).toBe('SIBENIK')
  })

  it('deleteLocation throws NEXT_NOT_FOUND on a cross-city id and leaves the row', async () => {
    const splitLocation = await createLocation({ city: 'SPLIT' })
    await loginSibenikAdmin()

    await expect(deleteLocation(splitLocation.id)).rejects.toThrow(/NEXT_NOT_FOUND/)
    expect(
      await db.location.findUnique({ where: { id: splitLocation.id } }),
    ).not.toBeNull()
  })

  it('deleteLocation removes an own-city venue without groups', async () => {
    const sibenikLocation = await createLocation({ city: 'SIBENIK' })
    await loginSibenikAdmin()

    const res = await deleteLocation(sibenikLocation.id)
    expect(res).toEqual({ success: true })
    expect(
      await db.location.findUnique({ where: { id: sibenikLocation.id } }),
    ).toBeNull()
  })
})

describe('getCourses — course feed city scoping', () => {
  it('shows shared standard programs and own radionice, hides the other city’s radionice', async () => {
    const standard = await createCourse() // shared: isCustom false, city null
    const sibenikRadionica = await createRadionica('SIBENIK')
    const splitRadionica = await createRadionica('SPLIT')
    await loginSibenikAdmin()

    const rows = await getCourses()
    const ids = new Set(rows.map((c) => c.id))
    expect(ids.has(standard.id)).toBe(true)
    expect(ids.has(sibenikRadionica.id)).toBe(true)
    expect(ids.has(splitRadionica.id)).toBe(false)
  })
})
