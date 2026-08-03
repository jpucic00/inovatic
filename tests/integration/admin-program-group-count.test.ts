import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse, createGroup, createLocation } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`
    throw err
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { getCourses } = await import('@/actions/admin/course')
const { getProgramDetail } = await import('@/actions/admin/program-materials')
const { getGroups } = await import('@/actions/admin/group')

const THIS_YEAR = '2026/2027'
const LAST_YEAR = '2025/2026'

let adminId = ''
let courseId = ''

function selectYear(value: string): void {
  mockedCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'inovatic_school_year' ? { name, value } : undefined,
  })
}

beforeAll(async () => {
  for (const label of [THIS_YEAR, LAST_YEAR]) {
    await db.schoolYear.upsert({ where: { label }, create: { label }, update: {} })
  }
  adminId = (await createAdmin({ city: 'SPLIT' })).id

  // A shared standard program (schoolYear: null) — the kind that accumulates
  // groups year over year, which is exactly what the badge used to sum up.
  const course = await createCourse({ kind: 'STANDARD', slug: 'group-count-standard' })
  courseId = course.id

  const split = await createLocation({ city: 'SPLIT' })
  const sibenik = await createLocation({ city: 'SIBENIK' })

  await createGroup({ courseId, locationId: split.id, city: 'SPLIT', schoolYear: THIS_YEAR })
  await createGroup({ courseId, locationId: split.id, city: 'SPLIT', schoolYear: THIS_YEAR })
  await createGroup({ courseId, locationId: split.id, city: 'SPLIT', schoolYear: LAST_YEAR })
  // Same year, other tenant — must not leak into a SPLIT admin's count.
  await createGroup({
    courseId,
    locationId: sibenik.id,
    city: 'SIBENIK',
    schoolYear: THIS_YEAR,
  })
})

beforeEach(() => {
  mockSession({ id: adminId, role: 'ADMIN', city: 'SPLIT' })
  selectYear(THIS_YEAR)
})

afterAll(async () => {
  await db.scheduledGroup.deleteMany({ where: { courseId } })
  await db.course.deleteMany({ where: { id: courseId } })
  await db.user.deleteMany({ where: { id: adminId } })
})

/**
 * The "N grupa" badge on /admin/programi (and in the program header) links to
 * the /admin/grupe list, which has always been scoped to the selected school
 * year. The counts were scoped by city only, so a program that also ran last
 * year advertised a number no page could show.
 */
describe('program group counts — school-year scoping', () => {
  it('getCourses counts only the selected year, in the admin city', async () => {
    const thisYear = (await getCourses()).find((c) => c.id === courseId)
    expect(thisYear?._count.scheduledGroups).toBe(2)

    selectYear(LAST_YEAR)
    const lastYear = (await getCourses()).find((c) => c.id === courseId)
    expect(lastYear?._count.scheduledGroups).toBe(1)
  })

  it('getProgramDetail counts only the selected year, in the admin city', async () => {
    const thisYear = await getProgramDetail(courseId)
    expect(thisYear.course.groupCount).toBe(2)

    selectYear(LAST_YEAR)
    const lastYear = await getProgramDetail(courseId)
    expect(lastYear.course.groupCount).toBe(1)
  })

  it('agrees with the group list the badge links to', async () => {
    for (const year of [THIS_YEAR, LAST_YEAR]) {
      selectYear(year)
      const listed = (await getGroups({ courseId })).length
      const fromList = (await getCourses()).find((c) => c.id === courseId)
      const fromHeader = await getProgramDetail(courseId)

      expect(fromList?._count.scheduledGroups).toBe(listed)
      expect(fromHeader.course.groupCount).toBe(listed)
    }
  })
})
