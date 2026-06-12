import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { InquiryStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createStudent,
  createCourse,
  createLocation,
  createGroup,
  createEnrollment,
  createInquiry,
} from './helpers/factory'

// getInquiries / getReturningStudentInfo pull in the admin action module graph,
// which calls revalidatePath in sibling actions; stub next/cache so nothing
// throws out of scope.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// getSelectedSchoolYear() reads next/headers cookies(); stub it so the inquiry
// list filter resolves to a deterministic year.
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

beforeAll(() => {
  delete process.env.RESEND_API_KEY
  setSelectedYearCookie(undefined)
})

const { getReturningStudentInfo, getInquiries } = await import('@/actions/admin/inquiry')

describe('getReturningStudentInfo', () => {
  it('matches an existing student by name + DOB and returns prior-year history', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const location = await createLocation({ name: 'Centar' })
    const course = await createCourse({ title: 'SLR 1 (RET)' })
    const group = await createGroup({
      courseId: course.id,
      locationId: location.id,
      name: 'Grupa A',
      schoolYear: '2024/2025',
    })
    const student = await createStudent({
      firstName: 'Marko',
      lastName: 'Marković',
      dateOfBirth: '2014-03-15',
    })
    await createEnrollment(student.id, group.id, { schoolYear: '2024/2025' })

    const info = await getReturningStudentInfo({
      firstName: 'marko', // case-insensitive
      lastName: 'Marković',
      dateOfBirth: '2014-03-15',
    })

    expect(info?.id).toBe(student.id)
    expect(info?.history).toHaveLength(1)
    expect(info?.history[0]?.schoolYear).toBe('2024/2025')
    expect(info?.history[0]?.groups[0]).toMatchObject({
      courseTitle: 'SLR 1 (RET)',
      groupName: 'Grupa A',
      locationName: 'Centar',
    })
  })

  it('returns null when the DOB differs', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await createStudent({ firstName: 'Ana', lastName: 'Anić', dateOfBirth: '2013-01-01' })

    const info = await getReturningStudentInfo({
      firstName: 'Ana',
      lastName: 'Anić',
      dateOfBirth: '2099-01-01',
    })
    expect(info).toBeNull()
  })

  it('returns null when the inquiry has no DOB (name alone never matches)', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await createStudent({ firstName: 'Iva', lastName: 'Ivić', dateOfBirth: '2012-02-02' })

    const info = await getReturningStudentInfo({
      firstName: 'Iva',
      lastName: 'Ivić',
      dateOfBirth: null,
    })
    expect(info).toBeNull()
  })

  it('suppresses the self-match via excludeStudentId', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const student = await createStudent({
      firstName: 'Petar',
      lastName: 'Perić',
      dateOfBirth: '2011-05-05',
    })

    const info = await getReturningStudentInfo({
      firstName: 'Petar',
      lastName: 'Perić',
      dateOfBirth: '2011-05-05',
      excludeStudentId: student.id,
    })
    expect(info).toBeNull()
  })
})

describe('getInquiries — isReturning flag', () => {
  const YEAR = '2026/2027'

  it('flags a NEW inquiry whose child matches an existing student, not a fresh one', async () => {
    const admin = await createAdmin()
    const marker = `RET${Date.now().toString(36)}`

    await createStudent({
      firstName: 'Vracam',
      lastName: marker,
      dateOfBirth: '2015-07-07',
    })
    const matching = await createInquiry({
      parentName: `${marker} match`,
      childFirstName: 'Vracam',
      childLastName: marker,
      childDateOfBirth: '2015-07-07',
      schoolYear: YEAR,
    })
    // Same last name + DOB but a different first name → no identity match.
    const fresh = await createInquiry({
      parentName: `${marker} fresh`,
      childFirstName: 'Novi',
      childLastName: marker,
      childDateOfBirth: '2015-07-07',
      schoolYear: YEAR,
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie(YEAR)

    const res = await getInquiries({ search: marker })
    const byId = new Map(res.data.map((r) => [r.id, r]))
    expect(byId.get(matching.id)?.isReturning).toBe(true)
    expect(byId.get(fresh.id)?.isReturning).toBe(false)
  })

  it('does not flag an ACCOUNT_CREATED inquiry that created the matched student', async () => {
    const admin = await createAdmin()
    const marker = `SELF${Date.now().toString(36)}`

    const student = await createStudent({
      firstName: 'Sebe',
      lastName: marker,
      dateOfBirth: '2016-08-08',
    })
    const inquiry = await createInquiry({
      parentName: `${marker} self`,
      childFirstName: 'Sebe',
      childLastName: marker,
      childDateOfBirth: '2016-08-08',
      status: InquiryStatus.ACCOUNT_CREATED,
      schoolYear: YEAR,
    })
    await db.inquiry.update({ where: { id: inquiry.id }, data: { studentId: student.id } })

    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie(YEAR)

    const res = await getInquiries({ search: marker })
    const row = res.data.find((r) => r.id === inquiry.id)
    expect(row?.isReturning).toBe(false)
  })
})
