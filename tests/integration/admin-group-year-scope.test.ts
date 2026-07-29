import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse, createLocation } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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

const { createGroup } = await import('@/actions/admin/group')

const SELECTED_YEAR = '2026/2027'
const OTHER_YEAR = '2025/2026'

function baseInput(courseId: string, locationId: string) {
  return {
    courseId,
    locationId,
    name: 'Grupa Test',
    startTime: '17:00',
    endTime: '18:30',
    maxStudents: 12,
  }
}

beforeAll(async () => {
  setSelectedYearCookie(SELECTED_YEAR)
  // `getSelectedSchoolYear` ignores the cookie unless the year is in the
  // SchoolYear registry, quietly falling back to the computed current year —
  // register it here rather than inheriting it from whichever file ran first.
  await db.schoolYear.upsert({
    where: { label: SELECTED_YEAR },
    create: { label: SELECTED_YEAR },
    update: {},
  })
})

describe('createGroup — school-year trust-boundary guard', () => {
  it('rejects a radionica belonging to a different school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie(SELECTED_YEAR)

    const location = await createLocation()
    const foreignRadionica = await createCourse({
      title: 'Stara radionica',
      kind: 'RADIONICA',
      schoolYear: OTHER_YEAR,
    })

    const res = await createGroup(baseInput(foreignRadionica.id, location.id))

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/ne pripada/i)
    }
    const created = await db.scheduledGroup.count({
      where: { courseId: foreignRadionica.id },
    })
    expect(created).toBe(0)
  })

  it('accepts a radionica stamped with the selected school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie(SELECTED_YEAR)

    const location = await createLocation()
    const radionica = await createCourse({
      title: 'Tekuća radionica',
      kind: 'RADIONICA',
      schoolYear: SELECTED_YEAR,
    })

    const res = await createGroup(baseInput(radionica.id, location.id))

    expect(res.success).toBe(true)
    const created = await db.scheduledGroup.findFirst({
      where: { courseId: radionica.id },
      select: { schoolYear: true },
    })
    expect(created).toMatchObject({ schoolYear: SELECTED_YEAR })
  })

  it('accepts a standard SLR program regardless of the selected year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie(SELECTED_YEAR)

    const location = await createLocation()
    // Standard programs are global (schoolYear = null) and always selectable.
    const standard = await createCourse({ title: 'SLR 1', kind: 'STANDARD' })

    const res = await createGroup({
      ...baseInput(standard.id, location.id),
      dayOfWeek: 'Ponedjeljak',
    })

    expect(res.success).toBe(true)
    const created = await db.scheduledGroup.count({
      where: { courseId: standard.id, schoolYear: SELECTED_YEAR },
    })
    expect(created).toBe(1)
  })
})
