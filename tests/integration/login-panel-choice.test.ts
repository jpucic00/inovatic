import { describe, expect, it, vi } from 'vitest'
import { loginAction } from '@/actions/login'
import {
  createAdmin,
  createGroup,
  createStudent,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

// loginAction clears the school-year cookie on success; `cookies()` has no
// request scope in the integration tier, so stub the cookie helper.
vi.mock('@/lib/school-year-cookie', () => ({
  clearSchoolYearCookie: vi.fn(() => Promise.resolve()),
}))

// next-auth's ESM entry drags in `next/server`, which doesn't resolve under
// the node test runner — stub the only export loginAction touches.
vi.mock('next-auth', () => ({
  AuthError: class AuthError extends Error {},
}))

// `signIn` is a no-op stub (tests/integration/setup.ts), so these tests cover
// the post-signIn role/panel resolution, not credential verification.
describe('loginAction — dual-role panel flag', () => {
  it('flags an admin with a teacher assignment for the panel choice', async () => {
    const admin = await createAdmin()
    const group = await createGroup()
    await createTeacherAssignment(admin.id, group.id)

    const result = await loginAction({ identifier: admin.email!, password: admin.plainPassword })

    expect(result).toEqual({ success: true, role: 'ADMIN', showTeacherPanel: true })
  })

  it('does not flag an admin without teacher assignments', async () => {
    const admin = await createAdmin()

    const result = await loginAction({ identifier: admin.email!, password: admin.plainPassword })

    expect(result).toEqual({ success: true, role: 'ADMIN', showTeacherPanel: false })
  })

  it('resolves the flag when logging in by username too', async () => {
    const admin = await createAdmin()
    const group = await createGroup()
    await createTeacherAssignment(admin.id, group.id)

    const result = await loginAction({ identifier: admin.username!, password: admin.plainPassword })

    expect(result).toEqual({ success: true, role: 'ADMIN', showTeacherPanel: true })
  })

  it('never flags a TEACHER, even with assignments (choice is admin-only)', async () => {
    const teacher = await createTeacher()
    const group = await createGroup()
    await createTeacherAssignment(teacher.id, group.id)

    const result = await loginAction({ identifier: teacher.email!, password: teacher.plainPassword })

    expect(result).toEqual({ success: true, role: 'TEACHER', showTeacherPanel: false })
  })

  it('never flags a STUDENT', async () => {
    const student = await createStudent()

    const result = await loginAction({ identifier: student.email!, password: student.plainPassword })

    expect(result).toEqual({ success: true, role: 'STUDENT', showTeacherPanel: false })
  })
})
