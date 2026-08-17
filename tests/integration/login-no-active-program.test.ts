import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { loginAction } from '@/actions/login'
import { createStudent } from './helpers/factory'

// loginAction clears the school-year cookie on success; `cookies()` has no
// request scope in the integration tier, so stub the cookie helper.
vi.mock('@/lib/school-year-cookie', () => ({
  clearSchoolYearCookie: vi.fn(() => Promise.resolve()),
}))

// next-auth's ESM entry drags in `next/server`, which doesn't resolve under the
// node test runner — same stub the sibling login test uses. `loginAction`
// narrows on `instanceof AuthError`, so the classes below extend THIS one.
vi.mock('next-auth', () => ({
  AuthError: class AuthError extends Error {},
}))

const mockedSignIn = vi.mocked(signIn)

class NoActiveProgram extends AuthError {
  code = 'no_active_program'
}

class WrongPassword extends AuthError {
  code = 'credentials'
}

class UnknownAuthFailure extends AuthError {}

beforeEach(() => {
  mockedSignIn.mockReset()
  mockedSignIn.mockResolvedValue(undefined)
})

/**
 * `@/lib/auth` is stubbed for the whole integration tier, so this covers
 * loginAction's ERROR MAPPING rather than @auth/core's propagation. That the
 * thrown instance actually survives @auth/core's error path is verified against
 * a real browser and a real NextAuth — a mock cannot prove a third party's
 * behaviour, and that was the one assumption worth checking for real.
 */
describe('loginAction — no active program', () => {
  it('maps the no_active_program code to its own message, not "wrong password"', async () => {
    mockedSignIn.mockRejectedValueOnce(new NoActiveProgram())

    const student = await createStudent()
    const res = await loginAction({
      identifier: student.username!,
      password: student.plainPassword,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/više nije dio nijednog programa/i)
      // The distinction is the whole point: a parent told "wrong password"
      // would hunt for a typo that does not exist.
      expect(res.error).not.toMatch(/Pogrešno korisničko ime/i)
    }
  })

  it('still reports a genuine credential failure as wrong username or password', async () => {
    mockedSignIn.mockRejectedValueOnce(new WrongPassword())

    const student = await createStudent()
    const res = await loginAction({ identifier: student.username!, password: 'nope' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Pogrešno korisničko ime ili lozinka/i)
  })

  it('falls back to the generic message for an unrecognised auth error', async () => {
    // Never leak an internal token to the login form.
    mockedSignIn.mockRejectedValueOnce(new UnknownAuthFailure())

    const student = await createStudent()
    const res = await loginAction({
      identifier: student.username!,
      password: student.plainPassword,
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Pogrešno korisničko ime ili lozinka/i)
  })
})
