import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse, createLocation } from './helpers/factory'
import { computeSchoolYear } from '@/lib/school-year'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

function setCookie(value: string | undefined): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' && value !== undefined
        ? { value, name }
        : undefined,
  })
}

const { getSelectedSchoolYear } = await import('@/lib/school-year-cookie')
const { createGroup } = await import('@/actions/admin/group')

const BOGUS_YEAR = '2098/2099'
const CURRENT_YEAR = computeSchoolYear()

beforeAll(() => {
  setCookie(undefined)
})

describe('getSelectedSchoolYear — registry validation', () => {
  it('returns the cookie year when it is registered', async () => {
    await db.schoolYear.upsert({
      where: { label: CURRENT_YEAR },
      create: { label: CURRENT_YEAR },
      update: {},
    })
    setCookie(CURRENT_YEAR)
    const result = await getSelectedSchoolYear()
    expect(result).toBe(CURRENT_YEAR)
  })

  it('falls back to computeSchoolYear when the cookie holds an unregistered year', async () => {
    // Confirm the bogus year is absent from the registry
    await db.schoolYear.deleteMany({ where: { label: BOGUS_YEAR } })
    setCookie(BOGUS_YEAR)
    const result = await getSelectedSchoolYear()
    expect(result).toBe(CURRENT_YEAR)
  })

  it('falls back to computeSchoolYear when the cookie is missing', async () => {
    setCookie(undefined)
    const result = await getSelectedSchoolYear()
    expect(result).toBe(CURRENT_YEAR)
  })
})

describe('createGroup — bogus cookie cannot stamp an unregistered year', () => {
  it('creates the group under the computed year, not the bogus cookie year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await db.schoolYear.upsert({
      where: { label: CURRENT_YEAR },
      create: { label: CURRENT_YEAR },
      update: {},
    })
    await db.schoolYear.deleteMany({ where: { label: BOGUS_YEAR } })

    const course = await createCourse({ isCustom: false })
    const location = await createLocation()

    setCookie(BOGUS_YEAR)
    const res = await createGroup({
      courseId: course.id,
      locationId: location.id,
      name: 'Bogus Year Group',
      startTime: '17:00',
      endTime: '18:30',
      maxStudents: 12,
    })

    expect(res.success).toBe(true)
    const group = await db.scheduledGroup.findFirst({
      where: { courseId: course.id },
      select: { schoolYear: true },
    })
    // Must land under the real current year, not the tampered cookie year
    expect(group?.schoolYear).toBe(CURRENT_YEAR)
    expect(group?.schoolYear).not.toBe(BOGUS_YEAR)
  })
})
