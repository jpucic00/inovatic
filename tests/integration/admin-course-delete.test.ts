import { afterAll, describe, expect, it, vi } from 'vitest'
import { MaterialScope } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createEnrollment,
  createEnrollmentWindow,
  createMaterial,
  createModule,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deleteCourse } = await import('@/actions/admin/course')

// Half of these cases exist precisely because `deleteCourse` *refuses*, so the
// courses, groups and RESTRICT-FK materials they set up survive the test. Left
// behind, they FK-block the next file that wipes courses — and that failure
// lands on whichever file happens to run after this one. Scoped teardown keeps
// the blame here.
const fx = fixtureScope()

afterAll(async () => {
  await fx.cleanup()
})

// P3 delete-integrity: deleteCourse must block while any material still hangs off
// the course (COURSE-scoped) or its modules (MODULE-scoped), so the app returns a
// clear Croatian message instead of falling through to the FK-RESTRICT throw.
describe('deleteCourse — delete-integrity guard (P3)', () => {
  it('blocks deleting a radionica that still has a COURSE-scoped material', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fx.course({ isCustom: true, schoolYear: '2026/2027' })
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

    const course = await fx.course({ isCustom: true, schoolYear: '2026/2027' })
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

    const course = await fx.course({ isCustom: false })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/SLR/i)
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
  })

  it('deletes a radionica that has no materials', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fx.course({ isCustom: true, schoolYear: '2026/2027' })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(true)
    expect(await db.course.count({ where: { id: course.id } })).toBe(0)
  })
})

// The confirm dialog promises "Bit će obrisane i sve pridružene grupe." —
// deleteCourse must take empty groups with the radionica (ScheduledGroup.course
// has no onDelete cascade) yet refuse, with a message naming the blocker, when
// a group still carries anything deleteGroup would refuse to drop.
describe('deleteCourse — pridružene grupe', () => {
  it('deletes a radionica together with its empty group', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fx.course({ isCustom: true, schoolYear: '2026/2027' })
    const group = await fx.group({ courseId: course.id, dateStart: '2027-02-01', dateEnd: '2027-02-05' })
    const teacher = await createTeacher()
    await createTeacherAssignment(teacher.id, group.id)
    await createEnrollmentWindow(course.id)

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(true)
    expect(await db.course.count({ where: { id: course.id } })).toBe(0)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(0)
    // Group-level teacher assignments and course-level enrollment windows
    // cascade — nothing orphaned, teacher account untouched.
    expect(await db.teacherAssignment.count({ where: { scheduledGroupId: group.id } })).toBe(0)
    expect(await db.courseEnrollmentWindow.count({ where: { courseId: course.id } })).toBe(0)
    expect(await db.user.count({ where: { id: teacher.id } })).toBe(1)
  })

  it('blocks deleting a radionica whose group has enrolled students', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fx.course({ isCustom: true, schoolYear: '2026/2027' })
    const group = await fx.group({ courseId: course.id, name: 'Termin A' })
    const student = await createStudent()
    await createEnrollment(student.id, group.id)

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) {
      // The app guard fired — a friendly message naming group + blocker, not
      // the P2003 fallback "Greška pri brisanju programa."
      expect(res.error).toContain('Termin A')
      expect(res.error).toMatch(/polaznike/)
    }
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
    expect(await db.enrollment.count({ where: { scheduledGroupId: group.id } })).toBe(1)
  })

  // `deleteGroup` enforces the archived-year guard; this path cascade-deletes
  // the same groups, so without the check the radionica is a way to mutate a
  // year the rest of the admin surface treats as read-only.
  it('refuses a radionica whose groups belong to an archived school year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const ARCHIVED = '2020/2021'
    await db.schoolYear.upsert({
      where: { label: ARCHIVED },
      create: { label: ARCHIVED },
      update: {},
    })
    const course = await fx.course({ isCustom: true, schoolYear: ARCHIVED })
    const group = await fx.group({ courseId: course.id, schoolYear: ARCHIVED })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
  })

  it('still deletes a radionica whose groups are in the current year', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const course = await fx.course({ isCustom: true, schoolYear: '2026/2027' })
    const group = await fx.group({ courseId: course.id, schoolYear: '2026/2027' })

    const res = await deleteCourse(course.id)

    expect(res).toEqual({ success: true })
    expect(await db.course.count({ where: { id: course.id } })).toBe(0)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(0)
  })
})
