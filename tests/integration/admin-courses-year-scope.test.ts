import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse } from './helpers/factory'

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

const { getCourses, createCourse: createCourseAction } = await import(
  '@/actions/admin/course'
)

beforeAll(async () => {
  setSelectedYearCookie(undefined)
  // `getSelectedSchoolYear` silently falls back to the computed current year
  // unless the cookie's year is in the SchoolYear registry — so every year this
  // file selects has to be registered here. Relying on another file's beforeAll
  // to do it made these cases pass or fail on file order.
  for (const label of ['2025/2026', '2026/2027', '2020/2021']) {
    await db.schoolYear.upsert({ where: { label }, create: { label }, update: {} })
  }
})

describe('getCourses — school-year scoping', () => {
  it('hides radionice from other years and always returns standard SLR', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const standard = await createCourse({ title: 'SLR 1', kind: 'STANDARD' })
    const radioYearA = await createCourse({
      title: 'Radionica A',
      kind: 'RADIONICA',
      schoolYear: '2025/2026',
    })
    const radioYearB = await createCourse({
      title: 'Radionica B',
      kind: 'RADIONICA',
      schoolYear: '2026/2027',
    })

    setSelectedYearCookie('2025/2026')
    const yearA = await getCourses()
    const yearAIds = yearA.map((c) => c.id)
    expect(yearAIds).toContain(standard.id)
    expect(yearAIds).toContain(radioYearA.id)
    expect(yearAIds).not.toContain(radioYearB.id)

    setSelectedYearCookie('2026/2027')
    const yearB = await getCourses()
    const yearBIds = yearB.map((c) => c.id)
    expect(yearBIds).toContain(standard.id)
    expect(yearBIds).toContain(radioYearB.id)
    expect(yearBIds).not.toContain(radioYearA.id)
  })
})

describe('createCourse — school-year stamping', () => {
  it('stamps the new radionica with the currently selected school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie('2026/2027')

    const res = await createCourseAction({
      title: 'Nova Radionica',
      description: 'Opis nove radionice',
      ageMin: 7,
      ageMax: 12,
    })

    expect(res.success).toBe(true)
    const created = await db.course.findFirst({
      where: { title: 'Nova Radionica' },
      select: { kind: true, schoolYear: true },
    })
    expect(created).toMatchObject({ kind: 'RADIONICA', schoolYear: '2026/2027' })
  })

  it('refuses creation when the selected year is archived', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    setSelectedYearCookie('2020/2021')

    const res = await createCourseAction({
      title: 'Stara Radionica',
      description: 'Pokušaj u arhivi',
      ageMin: 7,
      ageMax: 12,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/Arhivirana/i)
    }
    const rows = await db.course.count({ where: { title: 'Stara Radionica' } })
    expect(rows).toBe(0)
  })
})
