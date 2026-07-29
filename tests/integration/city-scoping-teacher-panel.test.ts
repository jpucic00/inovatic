import { describe, expect, it, vi } from 'vitest'
import type { Session } from 'next-auth'
import { computeSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createModule,
  createModuleSchedule,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

const { getMyAssignedGroups } = await import('@/actions/teacher/dashboard')
const { getTeacherGroupDetail } = await import('@/actions/teacher/group')
const { assertTeacherCanViewStudent } = await import('@/lib/teacher-guard')
const { canManageMaterial } = await import('@/lib/material-access')

// The teacher dashboard filters by the CURRENT school year (July 2026 →
// 2025/2026), not the factories' default 2026/2027.
const CY = computeSchoolYear()

const fakeSession = (id: string, city: 'SPLIT' | 'SIBENIK'): Session =>
  ({
    user: { id, role: 'ADMIN', city },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  }) as Session

describe('getMyAssignedGroups — tenant-bound ADMIN pass-through (Slavica)', () => {
  it('an ADMIN sees only their own city current-year groups', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: CY })
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: CY })
    const slavica = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: slavica.id, role: 'ADMIN', city: 'SIBENIK' })

    const groups = await getMyAssignedGroups()
    const ids = new Set(groups.map((g) => g.id))
    expect(ids.has(sibenikGroup.id)).toBe(true)
    expect(ids.has(splitGroup.id)).toBe(false)
  })

  it('a TEACHER still sees exactly their assigned groups', async () => {
    const group = await createGroup({ city: 'SIBENIK', schoolYear: CY })
    const otherGroup = await createGroup({ city: 'SIBENIK', schoolYear: CY })
    const teacher = await createTeacher({ city: 'SIBENIK' })
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SIBENIK' })

    const groups = await getMyAssignedGroups()
    const ids = new Set(groups.map((g) => g.id))
    expect(ids.has(group.id)).toBe(true)
    expect(ids.has(otherGroup.id)).toBe(false)
  })
})

describe('teacher-guard ADMIN bypasses — city-bound', () => {
  it('getTeacherGroupDetail 404s a cross-city group for an ADMIN', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: CY })
    const slavica = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: slavica.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(getTeacherGroupDetail(splitGroup.id)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('getTeacherGroupDetail serves the ADMIN own-city group', async () => {
    const sibenikGroup = await createGroup({ city: 'SIBENIK', schoolYear: CY })
    const slavica = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: slavica.id, role: 'ADMIN', city: 'SIBENIK' })

    const detail = await getTeacherGroupDetail(sibenikGroup.id)
    expect(detail.id).toBe(sibenikGroup.id)
  })

  it('assertTeacherCanViewStudent 404s a cross-city student for an ADMIN', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    const sibenikStudent = await createStudent({ city: 'SIBENIK' })
    const slavica = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: slavica.id, role: 'ADMIN', city: 'SIBENIK' })

    await expect(assertTeacherCanViewStudent(splitStudent.id)).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(assertTeacherCanViewStudent(sibenikStudent.id)).resolves.toMatchObject({
      isAdmin: true,
    })
  })
})

describe('per-city module arc divergence', () => {
  it('the same shared course paces each city group by its own city schedule', async () => {
    const course = await createCourse({ kind: 'STANDARD' })
    const m1 = await createModule(course.id, { sortOrder: 0, title: 'Modul 1' })
    // Same module, same year — two per-city rows with different windows.
    await createModuleSchedule(m1.id, {
      schoolYear: CY,
      city: 'SPLIT',
      startDate: new Date('2025-09-02T00:00:00.000Z'),
      endDate: new Date('2025-10-20T00:00:00.000Z'),
    })
    await createModuleSchedule(m1.id, {
      schoolYear: CY,
      city: 'SIBENIK',
      startDate: new Date('2025-11-03T00:00:00.000Z'),
      endDate: new Date('2025-12-22T00:00:00.000Z'),
    })
    const splitGroup = await createGroup({ city: 'SPLIT', courseId: course.id, schoolYear: CY })
    const sibenikGroup = await createGroup({
      city: 'SIBENIK',
      courseId: course.id,
      schoolYear: CY,
    })

    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: splitAdmin.id, role: 'ADMIN', city: 'SPLIT' })
    const splitDetail = await getTeacherGroupDetail(splitGroup.id)

    const sibenikAdmin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenikAdmin.id, role: 'ADMIN', city: 'SIBENIK' })
    const sibenikDetail = await getTeacherGroupDetail(sibenikGroup.id)

    const splitM1 = splitDetail.course.modules.find((m) => m.id === m1.id)
    const sibenikM1 = sibenikDetail.course.modules.find((m) => m.id === m1.id)
    expect(splitM1?.schedule?.startDate?.toISOString()).toBe('2025-09-02T00:00:00.000Z')
    expect(sibenikM1?.schedule?.startDate?.toISOString()).toBe('2025-11-03T00:00:00.000Z')
  })
})

describe('canManageMaterial — ADMIN city bounds', () => {
  it('GROUP materials are per-city; MODULE/COURSE stay shared curriculum', async () => {
    const splitGroup = await createGroup({ city: 'SPLIT' })
    const sibenikGroup = await createGroup({ city: 'SIBENIK' })
    const course = await createCourse({ kind: 'STANDARD' })
    const mod = await createModule(course.id)
    const slavica = await createAdmin({ city: 'SIBENIK' })
    const session = fakeSession(slavica.id, 'SIBENIK')

    expect(
      await canManageMaterial(session, { scope: 'GROUP', scheduledGroupId: splitGroup.id }),
    ).toBe(false)
    expect(
      await canManageMaterial(session, { scope: 'GROUP', scheduledGroupId: sibenikGroup.id }),
    ).toBe(true)
    // Shared curriculum (owner decision 2026-07-10): any admin, any city.
    expect(await canManageMaterial(session, { scope: 'COURSE', courseId: course.id })).toBe(true)
    expect(await canManageMaterial(session, { scope: 'MODULE', moduleId: mod.id })).toBe(true)
  })
})
