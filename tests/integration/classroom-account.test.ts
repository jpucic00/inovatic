/**
 * Račun za učionicu — the one permanent shared login per city (2026-09-20).
 *
 * The row is created by the `classroom_accounts` migration, not by the app, so
 * what these tests pin is (1) that the migration produced exactly what the
 * login path expects — one row per city, a pgcrypto `bf` hash that bcryptjs
 * verifies against the readable `plainPassword` — and (2) that the account
 * stays OUT of everything a `role: 'STUDENT'` query feeds: the student list,
 * the staff list, the dashboard count, campaign recipients.
 */
import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { revalidateTokenClaims } from '@/lib/auth-token'
import { mockSession } from './setup'
import { classroomAccount, createAdmin, createTeacher } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/school-year-cookie', () => ({
  getSelectedSchoolYear: vi.fn(() => Promise.resolve('2026/2027')),
}))

const { getStudents } = await import('@/actions/admin/student')
const { getTeachers } = await import('@/actions/admin/teacher')
const { previewEmailRecipients } = await import('@/actions/admin/email-campaign')
const { getClassroomCredentials } = await import('@/actions/teacher/classroom')

describe('classroom_accounts migration', () => {
  it('created exactly one CLASSROOM row per city, under the documented usernames', async () => {
    const rows = await db.user.findMany({
      where: { role: 'CLASSROOM' },
      select: { username: true, city: true, email: true, firstName: true },
      orderBy: { username: 'asc' },
    })
    expect(rows).toEqual([
      { username: 'ucionica-sibenik', city: 'SIBENIK', email: 'ucionica-sibenik@classroom.inovatic.local', firstName: 'Učionica' },
      { username: 'ucionica-split', city: 'SPLIT', email: 'ucionica-split@classroom.inovatic.local', firstName: 'Učionica' },
    ])
  })

  it('stored a password that bcryptjs verifies — pgcrypto bf ≡ the app hash', async () => {
    for (const city of ['SPLIT', 'SIBENIK'] as const) {
      const row = await classroomAccount(city)
      expect(row.plainPassword).toMatch(/^[a-z0-9]{6}$/)
      expect(await bcrypt.compare(row.plainPassword!, row.passwordHash)).toBe(true)
    }
  })

  it('holds no enrollments', async () => {
    const row = await classroomAccount('SPLIT')
    expect(await db.enrollment.count({ where: { userId: row.id } })).toBe(0)
  })
})

describe('session revalidation', () => {
  it('keeps a CLASSROOM token alive with zero enrollments — the student gate is STUDENT-only', async () => {
    const row = await classroomAccount('SPLIT')
    const token = await revalidateTokenClaims({
      id: row.id,
      role: 'CLASSROOM' as const,
      city: 'SPLIT' as const,
      checkedAt: 0,
    })
    expect(token).not.toBeNull()
    expect(token?.role).toBe('CLASSROOM')
  })
})

describe('the account stays out of every student/staff surface', () => {
  it('is absent from /admin/ucenici, /admin/nastavnici and the dashboard count', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const row = await classroomAccount('SPLIT')

    const students = await getStudents({ search: 'Učionica', schoolYear: '2026/2027' })
    expect(students.data.map((s) => s.id)).not.toContain(row.id)

    const teachers = await getTeachers({ search: 'Učionica' })
    expect(teachers.data.map((t) => t.id)).not.toContain(row.id)

    // The "Učenici" stat card on /admin: the same where the page uses.
    const counted = await db.user.count({ where: { role: 'STUDENT', city: 'SPLIT', id: row.id } })
    expect(counted).toBe(0)
  })

  it('cannot be smuggled into a CREDENTIALS campaign by id', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
    const row = await classroomAccount('SPLIT')

    const preview = await previewEmailRecipients({
      kind: 'CREDENTIALS',
      sourceSchoolYear: '2026/2027',
      sourceStudentIds: [row.id],
    })
    // The cohort resolver re-derives against role: STUDENT and refuses an id
    // that is not one, rather than silently dropping it.
    expect(preview.success).toBe(false)
  })
})

describe('getClassroomCredentials', () => {
  it("returns the caller's own city's login, never the other one", async () => {
    const split = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: split.id, role: 'TEACHER', city: 'SPLIT' })
    expect(await getClassroomCredentials()).toEqual({
      username: 'ucionica-split',
      password: (await classroomAccount('SPLIT')).plainPassword,
    })

    const sibenik = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: sibenik.id, role: 'ADMIN', city: 'SIBENIK' })
    expect((await getClassroomCredentials())?.username).toBe('ucionica-sibenik')
  })

  it('refuses a student', async () => {
    const student = await (await import('./helpers/factory')).createStudent()
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })
    await expect(getClassroomCredentials()).rejects.toThrow()
  })
})
