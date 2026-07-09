import { describe, expect, it, vi } from 'vitest'
import { MaterialScope } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createCourse, createModule, createMaterial } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deleteCourse } = await import('@/actions/admin/course')

// P3 delete-integrity: deleteCourse must block while any material still hangs off
// the course (COURSE-scoped) or its modules (MODULE-scoped), so the app returns a
// clear Croatian message instead of falling through to the FK-RESTRICT throw.
describe('deleteCourse — delete-integrity guard (P3)', () => {
  it('blocks deleting a radionica that still has a COURSE-scoped material', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: true, schoolYear: '2026/2027' })
    await createMaterial({ scope: MaterialScope.COURSE, courseId: course.id })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/materijale/i)
    // The app guard fired — not the FK RESTRICT — and the course survives.
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
  })

  it('blocks deleting a radionica whose module still has a material', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: true, schoolYear: '2026/2027' })
    const mod = await createModule(course.id)
    await createMaterial({ scope: MaterialScope.MODULE, moduleId: mod.id })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/materijale/i)
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
  })

  it('refuses to delete a standard SLR program regardless of materials', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: false })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/SLR/i)
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
  })

  it('deletes a radionica that has no materials', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await createCourse({ isCustom: true, schoolYear: '2026/2027' })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(true)
    expect(await db.course.count({ where: { id: course.id } })).toBe(0)
  })
})
