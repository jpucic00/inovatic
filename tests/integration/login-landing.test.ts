import { describe, expect, it, vi } from 'vitest'
import { loginAction } from '@/actions/login'
import {
  createAdmin,
  createEnrollment,
  createGroup,
  createParent,
  createStudent,
  createTeacher,
  createTeacherAssignment,
  linkToParent,
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

/** A child in an active program, linked to `accountId`. */
async function activeChildOf(accountId: string) {
  const child = await createStudent()
  await createEnrollment(child.id, (await createGroup()).id)
  await linkToParent(child.id, accountId)
  return child
}

// `signIn` is a no-op stub (tests/integration/setup.ts), so these tests cover
// the post-signIn landing, not credential verification.
describe('loginAction — where a login lands', () => {
  it('opens the portal directly for a parent with one active child', async () => {
    const parent = await createParent()
    await activeChildOf(parent.id)

    const result = await loginAction({ identifier: parent.email, password: parent.plainPassword })

    expect(result).toEqual({ success: true, destination: '/portal' })
  })

  it('sends a parent of siblings to the picker', async () => {
    const parent = await createParent()
    await activeChildOf(parent.id)
    await activeChildOf(parent.id)

    const result = await loginAction({ identifier: parent.email, password: parent.plainPassword })

    expect(result).toEqual({ success: true, destination: '/portal/odabir' })
  })

  it('matches the e-mail case-insensitively, as authorize() does', async () => {
    const parent = await createParent()
    await activeChildOf(parent.id)

    const result = await loginAction({
      identifier: parent.email.toUpperCase(),
      password: parent.plainPassword,
    })

    expect(result).toEqual({ success: true, destination: '/portal' })
  })

  it('offers a dual-role admin the picker', async () => {
    const admin = await createAdmin()
    await createTeacherAssignment(admin.id, (await createGroup()).id)

    const result = await loginAction({ identifier: admin.email, password: admin.plainPassword })

    expect(result).toEqual({ success: true, destination: '/portal/odabir' })
  })

  it('sends an admin without assignments straight to /admin', async () => {
    const admin = await createAdmin()

    const result = await loginAction({ identifier: admin.email, password: admin.plainPassword })

    expect(result).toEqual({ success: true, destination: '/admin' })
  })

  it('sends a teacher straight to /nastavnik', async () => {
    const teacher = await createTeacher()
    await createTeacherAssignment(teacher.id, (await createGroup()).id)

    const result = await loginAction({ identifier: teacher.email, password: teacher.plainPassword })

    expect(result).toEqual({ success: true, destination: '/nastavnik' })
  })

  it('offers a teacher whose own child attends the picker', async () => {
    const teacher = await createTeacher()
    await activeChildOf(teacher.id)

    const result = await loginAction({ identifier: teacher.email, password: teacher.plainPassword })

    expect(result).toEqual({ success: true, destination: '/portal/odabir' })
  })

  it('does not count a linked child who is in no active program', async () => {
    const teacher = await createTeacher()
    const child = await createStudent()
    await createEnrollment(child.id, (await createGroup()).id, { schoolYear: '2019/2020' })
    await linkToParent(child.id, teacher.id)

    const result = await loginAction({ identifier: teacher.email, password: teacher.plainPassword })

    expect(result).toEqual({ success: true, destination: '/nastavnik' })
  })
})
