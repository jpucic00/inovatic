/**
 * `getInquiries` filter vocabulary (Flux ojkxwfu).
 *
 * The year, city, search, returning and type filters are covered elsewhere.
 * What had no test are the two sentinel values the toolbar sends — `status:
 * 'ALL'` and `courseId: 'NONE'` — plus the razred filter. Sentinels are the
 * dangerous kind of filter: 'ALL' reaching Prisma as a literal status, or
 * 'NONE' as a literal course id, both return an empty table rather than an
 * error, which reads as "no upiti yet" on a screen staff triage from.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import { createAdmin, createCourse, createInquiry } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const { getInquiries } = await import('@/actions/admin/inquiry')

const YEAR = computeSchoolYear()
// A razred nobody else in this shared-DB tier files upiti under, so the grade
// assertions can count rows globally instead of guessing at neighbours.
const GRADE = 'ss3' as const

let courseId: string
let withCourseId: string
let withoutCourseId: string
let declinedId: string

beforeAll(async () => {
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === 'inovatic_school_year' ? { value: YEAR, name } : undefined),
  })
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })

  const course = await createCourse({ kind: 'COMPETITION' })
  courseId = course.id
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

  const withCourse = await createInquiry({
    city: 'SPLIT',
    schoolYear: YEAR,
    courseId,
    childGrade: GRADE,
  })
  withCourseId = withCourse.id
  const withoutCourse = await createInquiry({
    city: 'SPLIT',
    schoolYear: YEAR,
    childGrade: GRADE,
  })
  withoutCourseId = withoutCourse.id
  const declined = await createInquiry({
    city: 'SPLIT',
    schoolYear: YEAR,
    courseId,
    childGrade: GRADE,
    status: 'DECLINED',
  })
  declinedId = declined.id
})

/** Ids of this fixture's rows in the result, in result order. */
function ourIds(rows: { id: string }[]): string[] {
  const mine = new Set([withCourseId, withoutCourseId, declinedId])
  return rows.filter((r) => mine.has(r.id)).map((r) => r.id)
}

describe('getInquiries — admin guard', () => {
  it('refuses a teacher session before any filter is considered', async () => {
    mockSession({ id: 'nastavnik', role: 'TEACHER', city: 'SPLIT' })

    await expect(getInquiries({ status: 'ALL' })).rejects.toThrow()
  })

  it('refuses a guest', async () => {
    mockSession(null)

    await expect(getInquiries({ status: 'ALL' })).rejects.toThrow()
  })
})

describe('getInquiries — status', () => {
  it("'ALL' keeps every status rather than matching a status named ALL", async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await getInquiries({ status: 'ALL', grade: GRADE, pageSize: 100 })

    expect(ourIds(res.data).sort()).toEqual(
      [withCourseId, withoutCourseId, declinedId].sort(),
    )
  })

  it('narrows to one status when a real one is picked', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await getInquiries({ status: 'DECLINED', grade: GRADE, pageSize: 100 })

    expect(ourIds(res.data)).toEqual([declinedId])
  })

  it('omitting status behaves like ALL', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await getInquiries({ grade: GRADE, pageSize: 100 })

    expect(ourIds(res.data)).toHaveLength(3)
  })
})

describe('getInquiries — courseId', () => {
  it("'NONE' means the upit named no program, not a course with that id", async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await getInquiries({ courseId: 'NONE', grade: GRADE, pageSize: 100 })

    expect(ourIds(res.data)).toEqual([withoutCourseId])
  })

  it('a real course id narrows to that program and drops the program-less upit', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await getInquiries({ courseId, grade: GRADE, pageSize: 100 })

    expect(ourIds(res.data).sort()).toEqual([withCourseId, declinedId].sort())
  })
})

describe('getInquiries — razred', () => {
  it('returns only the picked razred', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const otherGrade = await createInquiry({
      city: 'SPLIT',
      schoolYear: YEAR,
      childGrade: 'ss4',
    })

    const res = await getInquiries({ grade: GRADE, pageSize: 100 })

    // Positive control FIRST: every assertion below is vacuously true on an
    // empty result, so a filter that matched nothing would read as correct.
    expect(ourIds(res.data)).toHaveLength(3)
    expect(res.data.map((r) => r.id)).not.toContain(otherGrade.id)
    expect(res.data.every((r) => r.childGrade === GRADE)).toBe(true)
    expect(res.total).toBe(res.data.length)
  })

  it('combines with status — both filters apply, not just the last one', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await getInquiries({
      grade: GRADE,
      status: 'NEW',
      courseId: 'NONE',
      pageSize: 100,
    })

    expect(ourIds(res.data)).toEqual([withoutCourseId])
  })
})
