import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { loginAction } from '@/actions/login'
import { createParent } from './helpers/factory'

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

class TooManyAttempts extends AuthError {
  code = 'too_many_attempts'
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

    const parent = await createParent()
    const res = await loginAction({
      identifier: parent.email,
      password: parent.plainPassword,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/nije upisano u program/i)
      // The distinction is the whole point: a parent told "wrong password"
      // would hunt for a typo that does not exist.
      expect(res.error).not.toMatch(/Pogrešan e-mail/i)
    }
  })

  it('still reports a genuine credential failure as wrong e-mail or password', async () => {
    mockedSignIn.mockRejectedValueOnce(new WrongPassword())

    const parent = await createParent()
    const res = await loginAction({ identifier: parent.email, password: 'nope' })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Pogrešan e-mail ili lozinka/i)
  })

  it('says a locked login is locked, rather than inviting the next guess', async () => {
    mockedSignIn.mockRejectedValueOnce(new TooManyAttempts())

    const parent = await createParent()
    const res = await loginAction({ identifier: parent.email, password: 'nope' })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/Previše neuspjelih pokušaja/)
      expect(res.error).not.toMatch(/Pogrešan e-mail/i)
    }
  })

  it('falls back to the generic message for an unrecognised auth error', async () => {
    // Never leak an internal token to the login form.
    mockedSignIn.mockRejectedValueOnce(new UnknownAuthFailure())

    const parent = await createParent()
    const res = await loginAction({
      identifier: parent.email,
      password: parent.plainPassword,
    })

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Pogrešan e-mail ili lozinka/i)
  })
})
