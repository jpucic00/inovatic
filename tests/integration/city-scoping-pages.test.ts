import { describe, expect, it, vi } from 'vitest'
import { City } from '@prisma/client'
import { mockSession } from './setup'
import { CITY_LABELS } from '@/lib/city'
import {
  buildStudentDetailForAdmin,
  buildStudentDetailForTeacher,
} from '@/lib/student-detail'
import { createAdmin, createStudent } from './helpers/factory'

// getStudent revalidates nothing itself but its module pulls in revalidatePath,
// and the city guard throws notFound() — stub the next integrations so the
// action body runs without a request scope and 404s become catchable throws
// (same setup as the sibling city-scoping files).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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

const { getStudent } = await import('@/actions/admin/student')

// City scoping for the admin pages tier (PR3): the student-detail builder and
// the getStudent entry the /admin/ucenici/[id] page renders from. Cross-city
// ids must be indistinguishable from nonexistent ones. Page-body queries
// (dashboard stats, dropdown feeds, planner-badge counts) are inline in server
// components and are covered by the E2E tier instead.

describe('CITY_LABELS', () => {
  it('maps every City enum value to a human label', () => {
    for (const city of Object.values(City)) {
      expect(CITY_LABELS[city]).toBeTruthy()
    }
    expect(CITY_LABELS.SPLIT).toBe('Split')
    expect(CITY_LABELS.SIBENIK).toBe('Šibenik')
  })
})

describe('buildStudentDetailForAdmin — tenant city param', () => {
  it('returns the student when the city matches', async () => {
    const student = await createStudent({ city: 'SIBENIK' })
    const detail = await buildStudentDetailForAdmin(student.id, 'SIBENIK')
    expect(detail?.id).toBe(student.id)
    expect(detail?.firstName).toBe(student.firstName)
  })

  it('returns null for a cross-city student — indistinguishable from a missing id', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const detail = await buildStudentDetailForAdmin(splitStudent.id, 'SIBENIK')
    expect(detail).toBeNull()
  })

  it('keeps the unscoped lookup when city is omitted (legacy/teacher-path compatibility)', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const detail = await buildStudentDetailForAdmin(splitStudent.id)
    expect(detail?.id).toBe(splitStudent.id)
  })
})

describe('buildStudentDetailForTeacher — unchanged in PR3', () => {
  it('still resolves students regardless of city (teacher scoping is PR4)', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const detail = await buildStudentDetailForTeacher(splitStudent.id)
    expect(detail?.id).toBe(splitStudent.id)
  })
})

describe('getStudent — /admin/ucenici/[id] data path', () => {
  it('404s (notFound) for a Šibenik admin probing a Split student id', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const splitStudent = await createStudent({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(getStudent(splitStudent.id)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('returns the full detail for a same-city student', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const student = await createStudent({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const detail = await getStudent(student.id)
    expect(detail?.id).toBe(student.id)
    expect(detail?.enrollments).toEqual([])
  })
})
