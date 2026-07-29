import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createInquiry,
  createStudent,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// The city guards 404 via notFound() and the admin guards bounce via
// redirect() — both from next/navigation, both throw in a real request.
// Mirror that here (same shape as city-scoping-teachers.test.ts).
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

// getSelectedSchoolYear() reads next/headers cookies(); stub it so the inquiry
// list / group picker filters resolve to a deterministic year.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setSelectedYearCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined
        ? { value, name }
        : undefined,
  })
}

// Import after the mocks so the actions pick up the mocked modules.
const {
  getInquiries,
  getInquiry,
  getInquiryCourses,
  getGroupsForCourse,
  getReturningStudentInfo,
  getScheduledParties,
  declineInquiry,
  deleteInquiry,
  sendScheduleOptions,
  schedulePartyInquiry,
} = await import('@/actions/admin/inquiry')

const SY = '2026/2027'

beforeAll(async () => {
  // sendScheduleOptions emails via Resend when the key is set; never in tests.
  delete process.env.RESEND_API_KEY
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
  setSelectedYearCookie(SY)
})

async function sibenikAdminSession() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

async function makePartyInquiry(city: 'SPLIT' | 'SIBENIK') {
  const inquiry = await createInquiry({ city, schoolYear: SY })
  return db.inquiry.update({ where: { id: inquiry.id }, data: { type: 'PARTY' } })
}

describe('getInquiries — city-scoped list', () => {
  it('Šibenik admin sees Šibenik inquiries but not Split inquiries', async () => {
    const marker = `LIST${Date.now().toString(36)}`
    const sibInquiry = await createInquiry({
      city: 'SIBENIK',
      schoolYear: SY,
      parentName: `${marker} sib`,
    })
    const splitInquiry = await createInquiry({
      city: 'SPLIT',
      schoolYear: SY,
      parentName: `${marker} split`,
    })
    await sibenikAdminSession()

    const res = await getInquiries({ search: marker })
    const ids = res.data.map((r) => r.id)
    expect(ids).toContain(sibInquiry.id)
    expect(ids).not.toContain(splitInquiry.id)
    expect(res.total).toBe(1)
  })
})

describe('getInquiry — cross-city detail is indistinguishable from nonexistent', () => {
  it('returns the row for a same-city inquiry, null for a cross-city one', async () => {
    const sibInquiry = await createInquiry({ city: 'SIBENIK', schoolYear: SY })
    const splitInquiry = await createInquiry({ city: 'SPLIT', schoolYear: SY })
    await sibenikAdminSession()

    const own = await getInquiry(sibInquiry.id)
    expect(own?.id).toBe(sibInquiry.id)

    expect(await getInquiry(splitInquiry.id)).toBeNull()
  })
})

describe('mutations by id — cross-city 404s, same-city works', () => {
  it('declineInquiry: cross-city throws NEXT_NOT_FOUND and leaves the row, same-city declines', async () => {
    const sibInquiry = await createInquiry({ city: 'SIBENIK', schoolYear: SY })
    const splitInquiry = await createInquiry({ city: 'SPLIT', schoolYear: SY })
    await sibenikAdminSession()

    await expect(declineInquiry(splitInquiry.id, 'Nema mjesta.')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    const splitRow = await db.inquiry.findUniqueOrThrow({ where: { id: splitInquiry.id } })
    expect(splitRow.status).toBe('NEW')

    const res = await declineInquiry(sibInquiry.id, 'Nema mjesta.')
    expect(res).toEqual({ success: true })
    const sibRow = await db.inquiry.findUniqueOrThrow({ where: { id: sibInquiry.id } })
    expect(sibRow.status).toBe('DECLINED')
  })

  it('deleteInquiry: cross-city throws NEXT_NOT_FOUND and the row survives, same-city deletes', async () => {
    const sibInquiry = await createInquiry({ city: 'SIBENIK', schoolYear: SY })
    const splitInquiry = await createInquiry({ city: 'SPLIT', schoolYear: SY })
    await sibenikAdminSession()

    await expect(deleteInquiry(splitInquiry.id)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(await db.inquiry.count({ where: { id: splitInquiry.id } })).toBe(1)

    const res = await deleteInquiry(sibInquiry.id)
    expect(res).toEqual({ success: true })
    expect(await db.inquiry.count({ where: { id: sibInquiry.id } })).toBe(0)
  })

  it('schedulePartyInquiry: cross-city throws NEXT_NOT_FOUND and stays NEW, same-city schedules', async () => {
    const sibParty = await makePartyInquiry('SIBENIK')
    const splitParty = await makePartyInquiry('SPLIT')
    await sibenikAdminSession()

    await expect(
      schedulePartyInquiry({ id: splitParty.id, confirmedDate: '2026-12-20', startTime: '18:00' }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    const splitRow = await db.inquiry.findUniqueOrThrow({ where: { id: splitParty.id } })
    expect(splitRow.status).toBe('NEW')

    const res = await schedulePartyInquiry({
      id: sibParty.id,
      confirmedDate: '2026-12-20',
      startTime: '18:00',
    })
    expect(res.success).toBe(true)
    const sibRow = await db.inquiry.findUniqueOrThrow({ where: { id: sibParty.id } })
    expect(sibRow.status).toBe('PARTY_SCHEDULED')
  })
})

describe('getScheduledParties — city-scoped calendar feed', () => {
  it('shows own-city scheduled parties, never the other city’s', async () => {
    const confirmed = new Date('2026-12-19T00:00:00.000Z')
    const sibParty = await makePartyInquiry('SIBENIK')
    const splitParty = await makePartyInquiry('SPLIT')
    await db.inquiry.updateMany({
      where: { id: { in: [sibParty.id, splitParty.id] } },
      data: { status: 'PARTY_SCHEDULED', partyConfirmedDate: confirmed, partyStartTime: '17:00' },
    })
    await sibenikAdminSession()

    const ids = (await getScheduledParties(SY)).map((p) => p.id)
    expect(ids).toContain(sibParty.id)
    expect(ids).not.toContain(splitParty.id)
  })
})

describe('getInquiryCourses — shared standard programs + own-city radionice', () => {
  it('offers shared courses and own-city radionice, never the other city’s radionice', async () => {
    const shared = await createCourse({ kind: 'STANDARD' })
    const sibRadionica = await createCourse({ kind: 'RADIONICA', schoolYear: SY })
    await db.course.update({ where: { id: sibRadionica.id }, data: { city: 'SIBENIK' } })
    const splitRadionica = await createCourse({ kind: 'RADIONICA', schoolYear: SY })
    await db.course.update({ where: { id: splitRadionica.id }, data: { city: 'SPLIT' } })
    await sibenikAdminSession()

    const ids = (await getInquiryCourses()).map((c) => c.id)
    expect(ids).toContain(shared.id)
    expect(ids).toContain(sibRadionica.id)
    expect(ids).not.toContain(splitRadionica.id)
  })
})

describe('getGroupsForCourse — inquiry-driven picker offers own-city groups only', () => {
  it('a Šibenik admin never sees Split groups for a shared course', async () => {
    const course = await createCourse()
    const sibGroup = await createGroup({ courseId: course.id, schoolYear: SY, city: 'SIBENIK' })
    const splitGroup = await createGroup({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })
    await sibenikAdminSession()

    const ids = (await getGroupsForCourse(course.id)).map((g) => g.id)
    expect(ids).toContain(sibGroup.id)
    expect(ids).not.toContain(splitGroup.id)
  })

  it('and vice versa: a Split admin never sees Šibenik groups', async () => {
    const course = await createCourse()
    const sibGroup = await createGroup({ courseId: course.id, schoolYear: SY, city: 'SIBENIK' })
    const splitGroup = await createGroup({ courseId: course.id, schoolYear: SY, city: 'SPLIT' })
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const ids = (await getGroupsForCourse(course.id)).map((g) => g.id)
    expect(ids).toContain(splitGroup.id)
    expect(ids).not.toContain(sibGroup.id)
  })
})

describe('sendScheduleOptions — inquiry and every offered group share one city', () => {
  it('404s on a cross-city inquiry id', async () => {
    const splitInquiry = await createInquiry({ city: 'SPLIT', schoolYear: SY })
    const splitGroup = await createGroup({ schoolYear: SY, city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(sendScheduleOptions(splitInquiry.id, [splitGroup.id])).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })

  it('rejects a cross-city group in the offer, accepts a same-city one', async () => {
    const sibInquiry = await createInquiry({ city: 'SIBENIK', schoolYear: SY })
    const sibGroup = await createGroup({ schoolYear: SY, city: 'SIBENIK' })
    const splitGroup = await createGroup({ schoolYear: SY, city: 'SPLIT' })
    await sibenikAdminSession()

    const smuggled = await sendScheduleOptions(sibInquiry.id, [sibGroup.id, splitGroup.id])
    expect(smuggled).toEqual({ success: false, error: 'Nevaljani podaci.' })

    const res = await sendScheduleOptions(sibInquiry.id, [sibGroup.id])
    expect(res).toEqual({ success: true })
  })
})

describe('returning-student detection across cities — masked flag only', () => {
  it('getInquiries: a cross-city identity match flags isReturningOtherCity, not isReturning', async () => {
    const marker = `XCITY${Date.now().toString(36)}`
    await createStudent({
      city: 'SPLIT',
      firstName: 'Preko',
      lastName: marker,
      dateOfBirth: '2015-04-04',
    })
    const sibInquiry = await createInquiry({
      city: 'SIBENIK',
      schoolYear: SY,
      parentName: `${marker} roditelj`,
      childFirstName: 'Preko',
      childLastName: marker,
      childDateOfBirth: '2015-04-04',
    })
    await sibenikAdminSession()

    const res = await getInquiries({ search: marker })
    const row = res.data.find((r) => r.id === sibInquiry.id)
    expect(row?.isReturning).toBe(false)
    expect(row?.isReturningOtherCity).toBe(true)
  })

  it('getInquiries: a same-city identity match keeps the full isReturning flag', async () => {
    const marker = `SAME${Date.now().toString(36)}`
    await createStudent({
      city: 'SIBENIK',
      firstName: 'Doma',
      lastName: marker,
      dateOfBirth: '2015-05-05',
    })
    const sibInquiry = await createInquiry({
      city: 'SIBENIK',
      schoolYear: SY,
      parentName: `${marker} roditelj`,
      childFirstName: 'Doma',
      childLastName: marker,
      childDateOfBirth: '2015-05-05',
    })
    await sibenikAdminSession()

    const res = await getInquiries({ search: marker })
    const row = res.data.find((r) => r.id === sibInquiry.id)
    expect(row?.isReturning).toBe(true)
    expect(row?.isReturningOtherCity).toBe(false)
  })

  it('getReturningStudentInfo: a cross-city match yields the masked variant — no id, DOB, or history', async () => {
    const marker = `MASK${Date.now().toString(36)}`
    const splitStudent = await createStudent({
      city: 'SPLIT',
      firstName: 'Skrivena',
      lastName: marker,
      dateOfBirth: '2014-01-01',
    })
    await sibenikAdminSession()

    const info = await getReturningStudentInfo({
      firstName: 'Skrivena',
      lastName: marker,
      dateOfBirth: '2014-01-01',
    })
    expect(info).toEqual({
      id: '',
      firstName: 'postojeći polaznik',
      lastName: '(druga lokacija)',
      dateOfBirth: null,
      history: [],
    })
    expect(info?.id).not.toBe(splitStudent.id)
  })

  it('getReturningStudentInfo: a same-city match keeps full details', async () => {
    const marker = `FULL${Date.now().toString(36)}`
    const sibStudent = await createStudent({
      city: 'SIBENIK',
      firstName: 'Vidljiva',
      lastName: marker,
      dateOfBirth: '2014-02-02',
    })
    await sibenikAdminSession()

    const info = await getReturningStudentInfo({
      firstName: 'Vidljiva',
      lastName: marker,
      dateOfBirth: '2014-02-02',
    })
    expect(info?.id).toBe(sibStudent.id)
    expect(info?.dateOfBirth).toBe('2014-02-02')
  })
})
