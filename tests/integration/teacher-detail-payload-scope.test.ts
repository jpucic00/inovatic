/**
 * `getTeacher` feeds `/admin/nastavnici/[id]`, a Server Component — whatever it
 * returns is serialised into the RSC payload and reaches the browser. It used
 * to use `include:`, which selects every scalar column, so `passwordHash` left
 * the server on every page load. The 2026-07-26 teacher-hours work widened the
 * filter to `role: { in: ['TEACHER','ADMIN'] }`, extending that to teaching
 * admins.
 *
 * Contract now:
 * - `passwordHash` is NEVER selected, for either role.
 * - `plainPassword` IS kept for TEACHER. That is deliberate and must stay: the
 *   page renders it under "Pristupni podaci" so an admin can help a teacher who
 *   lost their login. (Same reasoning as the kids' passwords in
 *   `student-detail-payload-scope.test.ts` — not an oversight to "fix".)
 * - `plainPassword` is omitted for ADMIN, matching the UI, which hides the
 *   whole credentials block for an admin account.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createTeacher, createTeacherAttendance } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getTeacher } = await import('@/actions/admin/teacher')

const fx = fixtureScope()

afterAll(async () => {
  await fx.cleanup()
})

describe('getTeacher — RSC payload scope', () => {
  it('never ships passwordHash, and keeps plainPassword for a TEACHER', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    await db.user.update({
      where: { id: teacher.id },
      data: { plainPassword: 'nastavnik-lozinka' },
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const row = await getTeacher(teacher.id)
    expect(row).not.toBeNull()
    if (!row) return

    expect(row).not.toHaveProperty('passwordHash')
    // Load-bearing: the credentials block renders this.
    expect(row.plainPassword).toBe('nastavnik-lozinka')
    // Everything the page renders is still there.
    expect(row.email).toBe(teacher.email)
    expect(row.firstName).toBe(teacher.firstName)
    expect(row.role).toBe('TEACHER')
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  /**
   * Pins the WHOLE key set, not just the absence of `passwordHash`. This value
   * is serialized into the RSC payload verbatim, so the test is the standing
   * proof of what reaches the browser — and it catches the actual failure mode,
   * which is someone widening the query later and shipping a new column without
   * noticing. Add a key here only together with a reason the page needs it.
   */
  it('ships exactly the fields the page renders and nothing else', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const row = await getTeacher(teacher.id)
    expect(row).not.toBeNull()
    if (!row) return

    expect(Object.keys(row).sort()).toEqual([
      '_count',
      'createdAt',
      'deletedAt',
      'email',
      'firstName',
      'id',
      'lastName',
      'phone',
      'plainPassword',
      'role',
      'teacherAssignments',
    ].sort())
  })

  it('omits plainPassword for a teaching ADMIN, matching the hidden credentials block', async () => {
    const viewer = await createAdmin()
    const teachingAdmin = await createAdmin()
    await db.user.update({
      where: { id: teachingAdmin.id },
      data: { plainPassword: 'admin-lozinka' },
    })
    // An ADMIN only appears in this section if she actually teaches.
    const group = await fx.group({ schoolYear: '2026/2027' })
    await createTeacherAttendance(teachingAdmin.id, group.id)

    mockSession({ id: viewer.id, role: 'ADMIN' })

    const row = await getTeacher(teachingAdmin.id)
    expect(row).not.toBeNull()
    if (!row) return

    expect(row).not.toHaveProperty('passwordHash')
    expect(row.plainPassword).toBeNull()
    expect(row.role).toBe('ADMIN')
  })

  it('keeps the assignment shape the detail panel renders', async () => {
    const admin = await createAdmin()
    const teacher = await createTeacher()
    const course = await fx.course({ title: 'SLR 2' })
    const group = await fx.group({ courseId: course.id, name: 'Termin A' })
    await db.teacherAssignment.create({
      data: { userId: teacher.id, scheduledGroupId: group.id },
    })
    mockSession({ id: admin.id, role: 'ADMIN' })

    const row = await getTeacher(teacher.id)
    const assignment = row?.teacherAssignments[0]
    expect(assignment?.scheduledGroup.name).toBe('Termin A')
    expect(assignment?.scheduledGroup.course.title).toBe('SLR 2')
    expect(assignment?.scheduledGroup.location.name).toEqual(expect.any(String))
    expect(assignment?.scheduledGroup.schoolYear).toEqual(expect.any(String))
  })

  it('a non-teaching admin is not a staff row at all', async () => {
    const viewer = await createAdmin()
    const pureAdmin = await createAdmin()
    mockSession({ id: viewer.id, role: 'ADMIN' })

    expect(await getTeacher(pureAdmin.id)).toBeNull()
  })

  it('a cross-city teacher reads as nonexistent', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    expect(await getTeacher(splitTeacher.id)).toBeNull()
  })
})
