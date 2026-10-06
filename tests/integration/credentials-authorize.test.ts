import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import {
  authorizeCredentials,
  LOGIN_FAILURES_PER_IDENTIFIER,
  LOGIN_FAILURES_PER_IP,
} from '@/lib/credentials-authorize'
import { resetRateLimits } from '@/lib/rate-limit'
import {
  classroomAccount,
  createEnrollment,
  createGroup,
  createParent,
  createStudent,
  createTeacher,
  linkToParent,
} from './helpers/factory'

/**
 * The credentials check behind Auth.js `authorize()`, against the real database:
 * who may sign in with what, and the failed-login throttle that sits in front
 * of it (5 failures per account, 30 per address, 15 minutes).
 */

const IP = '203.0.113.7'
const OTHER_IP = '198.51.100.9'

const login = (identifier: string, password: string, ip = IP) =>
  authorizeCredentials({ identifier, password }, ip)

async function failTimes(identifier: string, times: number, ip = IP) {
  for (let i = 0; i < times; i++) {
    const res = await login(identifier, 'kriva-lozinka', ip)
    expect(res).toEqual({ ok: false, reason: 'INVALID' })
  }
}

beforeEach(() => {
  resetRateLimits()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('authorizeCredentials — who signs in', () => {
  it('a teacher signs in by e-mail, in any letter case', async () => {
    const teacher = await createTeacher()
    const res = await login(teacher.email.toUpperCase(), teacher.plainPassword)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.user).toMatchObject({ id: teacher.id, role: 'TEACHER', studentId: null, sessionVersion: 0 })
    }
  })

  it('refuses a wrong password, an unknown address and a deleted account alike', async () => {
    const teacher = await createTeacher()
    const gone = await createTeacher({ deletedAt: new Date() })
    expect(await login(teacher.email, 'nije-to')).toEqual({ ok: false, reason: 'INVALID' })
    expect(await login('nitko@test.local', teacher.plainPassword)).toEqual({ ok: false, reason: 'INVALID' })
    expect(await login(gone.email, gone.plainPassword)).toEqual({ ok: false, reason: 'INVALID' })
  })

  it('a child never signs in — neither by username nor by e-mail', async () => {
    const child = await createStudent()
    expect(await login(child.username as string, child.plainPassword)).toEqual({ ok: false, reason: 'INVALID' })
    expect(await login(child.email, child.plainPassword)).toEqual({ ok: false, reason: 'INVALID' })
  })

  it('a username opens only the classroom login', async () => {
    const teacher = await createTeacher()
    expect(await login(teacher.username as string, teacher.plainPassword)).toEqual({
      ok: false,
      reason: 'INVALID',
    })
    // The classroom password is generated per environment and never known here,
    // so a wrong one is what can be asserted: refused as INVALID, not as a
    // role refusal that would read differently.
    const classroom = await classroomAccount('SPLIT')
    expect(await login(classroom.username as string, 'kriva')).toEqual({ ok: false, reason: 'INVALID' })
  })

  it('a parent with one enrolled child opens straight on that child', async () => {
    const parent = await createParent()
    const child = await createStudent()
    await linkToParent(child.id, parent.id)
    await createEnrollment(child.id, (await createGroup()).id)

    const res = await login(parent.email, parent.plainPassword)
    expect(res.ok && res.user.studentId).toBe(child.id)
  })

  it('a parent with no enrolled child is told so — and it is not counted as a failure', async () => {
    const parent = await createParent()
    for (let i = 0; i < LOGIN_FAILURES_PER_IDENTIFIER + 1; i++) {
      expect(await login(parent.email, parent.plainPassword)).toEqual({
        ok: false,
        reason: 'NO_ACTIVE_PROGRAM',
      })
    }
  })
})

describe('authorizeCredentials — e-mail is matched exactly, not as an ILIKE pattern', () => {
  it('"_" in the typed address is not a wildcard: a spelling variant reaches no account', async () => {
    const teacher = await createTeacher({ email: `ivana-${Date.now()}@test.local` })
    const variant = `_${teacher.email.slice(1)}`
    expect(await login(variant, teacher.plainPassword)).toEqual({ ok: false, reason: 'INVALID' })
  })

  it('an address with "_" opens its own account even when a look-alike exists', async () => {
    const stamp = Date.now()
    // Created first, so an unescaped ILIKE would be likely to return it.
    await createTeacher({ email: `ivanxhorvat-${stamp}@test.local` })
    const real = await createTeacher({ email: `ivan_horvat-${stamp}@test.local` })
    const res = await login(real.email, real.plainPassword)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.user.id).toBe(real.id)
  })
})

describe('authorizeCredentials — failed-login throttle', () => {
  it(`locks an account after ${LOGIN_FAILURES_PER_IDENTIFIER} failures, even for the right password and from another address`, async () => {
    const teacher = await createTeacher()
    await failTimes(teacher.email, LOGIN_FAILURES_PER_IDENTIFIER)

    expect(await login(teacher.email, teacher.plainPassword)).toEqual({ ok: false, reason: 'THROTTLED' })
    expect(await login(teacher.email, teacher.plainPassword, OTHER_IP)).toEqual({
      ok: false,
      reason: 'THROTTLED',
    })
    // The lock is keyed on the address as typed, case folded.
    expect(await login(teacher.email.toUpperCase(), teacher.plainPassword)).toEqual({
      ok: false,
      reason: 'THROTTLED',
    })
  })

  it('a locked account does not touch the database or the hash', async () => {
    const teacher = await createTeacher()
    await failTimes(teacher.email, LOGIN_FAILURES_PER_IDENTIFIER)
    const lookup = vi.spyOn(db.user, 'findMany')
    const hash = vi.spyOn(bcrypt, 'compare')
    expect(await login(teacher.email, teacher.plainPassword)).toEqual({ ok: false, reason: 'THROTTLED' })
    expect(lookup).not.toHaveBeenCalled()
    expect(hash).not.toHaveBeenCalled()
  })

  it('a parallel burst gets no more guesses than the limit (attempts are counted before the first await)', async () => {
    const teacher = await createTeacher()
    const hash = vi.spyOn(bcrypt, 'compare')
    const results = await Promise.all(
      Array.from({ length: 20 }, () => login(teacher.email, 'kriva-lozinka')),
    )
    expect(hash).toHaveBeenCalledTimes(LOGIN_FAILURES_PER_IDENTIFIER)
    expect(results.filter((r) => !r.ok && r.reason === 'INVALID')).toHaveLength(LOGIN_FAILURES_PER_IDENTIFIER)
    expect(results.filter((r) => !r.ok && r.reason === 'THROTTLED')).toHaveLength(20 - LOGIN_FAILURES_PER_IDENTIFIER)
  })

  it('a successful login takes back its own IP hit — it never counts toward the address lock', async () => {
    const teacher = await createTeacher()
    for (let i = 0; i < LOGIN_FAILURES_PER_IP + 1; i++) {
      expect((await login(teacher.email, teacher.plainPassword)).ok).toBe(true)
    }
    const other = await createTeacher()
    expect((await login(other.email, other.plainPassword)).ok).toBe(true)
  }, 30_000)

  it('a lookup that throws gives the reservation back — an outage is not a guess', async () => {
    const teacher = await createTeacher()
    vi.spyOn(db.user, 'findMany').mockRejectedValue(new Error('P1017'))
    for (let i = 0; i < LOGIN_FAILURES_PER_IDENTIFIER; i++) {
      await expect(login(teacher.email, teacher.plainPassword)).rejects.toThrow('P1017')
    }
    vi.restoreAllMocks()
    expect((await login(teacher.email, teacher.plainPassword)).ok).toBe(true)
  })

  it('locks an unknown address exactly like a real one, so the lock reveals nothing', async () => {
    const unknown = `nepostojeci-${Date.now()}@test.local`
    await failTimes(unknown, LOGIN_FAILURES_PER_IDENTIFIER)
    expect(await login(unknown, 'bilo-sto')).toEqual({ ok: false, reason: 'THROTTLED' })
  }, 20_000)

  it('a successful login forgives that account its earlier typos', async () => {
    const teacher = await createTeacher()
    await failTimes(teacher.email, LOGIN_FAILURES_PER_IDENTIFIER - 1)
    expect((await login(teacher.email, teacher.plainPassword)).ok).toBe(true)
    await failTimes(teacher.email, LOGIN_FAILURES_PER_IDENTIFIER - 1)
    expect((await login(teacher.email, teacher.plainPassword)).ok).toBe(true)
  })

  it("one account's lock leaves the other accounts alone", async () => {
    const a = await createTeacher()
    const b = await createTeacher()
    await failTimes(a.email, LOGIN_FAILURES_PER_IDENTIFIER)
    expect((await login(b.email, b.plainPassword)).ok).toBe(true)
  })

  it(`locks an address after ${LOGIN_FAILURES_PER_IP} failures spread over many accounts`, async () => {
    const perAccount = LOGIN_FAILURES_PER_IDENTIFIER - 1
    const accounts = await Promise.all(
      Array.from({ length: Math.ceil(LOGIN_FAILURES_PER_IP / perAccount) }, () => createTeacher()),
    )
    let failures = 0
    for (const account of accounts) {
      const n = Math.min(perAccount, LOGIN_FAILURES_PER_IP - failures)
      await failTimes(account.email, n)
      failures += n
    }
    const fresh = await createTeacher()
    expect(await login(fresh.email, fresh.plainPassword)).toEqual({ ok: false, reason: 'THROTTLED' })
    // The same account from somewhere else is untouched.
    expect((await login(fresh.email, fresh.plainPassword, OTHER_IP)).ok).toBe(true)
  })

  it('logs once, when the lock engages, and never the e-mail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const teacher = await createTeacher()
    await failTimes(teacher.email, LOGIN_FAILURES_PER_IDENTIFIER)
    await login(teacher.email, 'jos-jednom')
    await login(teacher.email, 'i-opet')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(IP)
    expect(String(warn.mock.calls[0][0])).not.toContain(teacher.email)
  })

  it('an empty form is not a guess and is not counted', async () => {
    const teacher = await createTeacher()
    for (let i = 0; i < LOGIN_FAILURES_PER_IDENTIFIER + 1; i++) {
      expect(await login(teacher.email, '')).toEqual({ ok: false, reason: 'INVALID' })
    }
    expect((await login(teacher.email, teacher.plainPassword)).ok).toBe(true)
  })
})
