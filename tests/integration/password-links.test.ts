/**
 * Password links (2026-09-29): the only way anyone gets a password. What these
 * tests hold:
 *  - a link works once, only the latest works, and it dies at its expiry;
 *  - setting a password through one logs every other session out;
 *  - only staff who can open a child's profile can send its parent a link,
 *    and not more than a few times an hour;
 *  - no path can store a readable password for anyone but the classroom login.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  classroomAccount,
  createAdmin,
  createEnrollment,
  createGroup,
  createParent,
  createStudent,
  createTeacher,
  createTeacherAssignment,
  linkToParent,
} from './helpers/factory'
import {
  hashPasswordToken,
  inspectPasswordToken,
  issuePasswordToken,
  redeemPasswordToken,
} from '@/lib/password-token'
import { revalidateTokenClaims } from '@/lib/auth-token'
import { resetRateLimits } from '@/lib/rate-limit'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7' }))),
  cookies: vi.fn(() => Promise.resolve({ get: () => undefined })),
}))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT: ${url}`)
    }),
  }
})
const { linkMailMock } = vi.hoisted(() => ({ linkMailMock: vi.fn(() => Promise.resolve(true)) }))
vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
  return { ...actual, sendPasswordLinkEmail: linkMailMock }
})

const { setPasswordWithLink, inspectPasswordLink } = await import('@/actions/password-setup')
const { sendParentPasswordLink, sendStaffPasswordLink } = await import('@/actions/password-link')
const { changeOwnPassword } = await import('@/actions/account')
const { createTeacher: createTeacherAction } = await import('@/actions/admin/teacher')

const GOOD = 'konj jede zeleni kupus'

beforeAll(() => {
  delete process.env.RESEND_API_KEY
})

beforeEach(() => {
  resetRateLimits()
  linkMailMock.mockClear()
})

/** A parent login with one child in an active program, in `groupId`. */
async function familyIn(groupId: string) {
  const parent = await createParent()
  const child = await createStudent()
  await linkToParent(child.id, parent.id)
  await createEnrollment(child.id, groupId)
  return { parent, child }
}

describe('a link', () => {
  it('stores only a hash, opens its account, and works exactly once', async () => {
    const parent = await createParent()
    const { token } = await issuePasswordToken({ userId: parent.id, purpose: 'SETUP', createdById: null })

    const row = await db.passwordToken.findFirstOrThrow({ where: { userId: parent.id } })
    expect(row.tokenHash).toBe(hashPasswordToken(token))
    expect(row.tokenHash).not.toContain(token)

    const first = await redeemPasswordToken(token, GOOD)
    expect(first).toEqual({ ok: true, email: parent.email })
    const after = await db.user.findUniqueOrThrow({ where: { id: parent.id } })
    expect(await bcrypt.compare(GOOD, after.passwordHash)).toBe(true)
    expect(after.passwordSetAt).not.toBeNull()
    expect(after.sessionVersion).toBe(parent.sessionVersion + 1)

    expect(await redeemPasswordToken(token, 'druga lozinka ovdje')).toEqual({ ok: false, reason: 'USED' })
  })

  it('stops working the moment a newer link is issued', async () => {
    const parent = await createParent()
    const old = await issuePasswordToken({ userId: parent.id, purpose: 'SETUP', createdById: null })
    await issuePasswordToken({ userId: parent.id, purpose: 'RESET', createdById: null })

    expect(await inspectPasswordToken(old.token)).toEqual({ ok: false, reason: 'EXPIRED' })
    expect(await redeemPasswordToken(old.token, GOOD)).toEqual({ ok: false, reason: 'EXPIRED' })
    expect(
      await db.passwordToken.count({ where: { userId: parent.id, expiresAt: { gt: new Date() } } }),
    ).toBe(1)
  })

  it('dies at its expiry', async () => {
    const parent = await createParent()
    const { token } = await issuePasswordToken({ userId: parent.id, purpose: 'RESET', createdById: null })
    await db.passwordToken.updateMany({
      where: { userId: parent.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await inspectPasswordToken(token)).toEqual({ ok: false, reason: 'EXPIRED' })
    expect(await redeemPasswordToken(token, GOOD)).toEqual({ ok: false, reason: 'EXPIRED' })
  })

  it('never opens a child, classroom or deleted account', async () => {
    const child = await createStudent()
    const classroom = await classroomAccount('SPLIT')
    const gone = await createParent({ deletedAt: new Date() })
    for (const userId of [child.id, classroom.id, gone.id]) {
      const { token } = await issuePasswordToken({ userId, purpose: 'SETUP', createdById: null })
      expect(await inspectPasswordToken(token)).toEqual({ ok: false, reason: 'INVALID' })
    }
    await db.passwordToken.deleteMany({ where: { userId: { in: [child.id, classroom.id, gone.id] } } })
  })

  it('logs out every session signed in before the password was set', async () => {
    const group = await createGroup()
    const { parent } = await familyIn(group.id)
    const staleToken = { id: parent.id, role: 'PARENT' as const, city: 'SPLIT' as const, checkedAt: 0, sessionVersion: parent.sessionVersion }
    expect(await revalidateTokenClaims({ ...staleToken })).not.toBeNull()

    const { token } = await issuePasswordToken({ userId: parent.id, purpose: 'SETUP', createdById: null })
    await redeemPasswordToken(token, GOOD)

    expect(await revalidateTokenClaims({ ...staleToken })).toBeNull()
  })
})

describe('the public setup actions', () => {
  it('show whose login it is — the parent address and the children it opens', async () => {
    const group = await createGroup()
    const { parent, child } = await familyIn(group.id)
    const { token } = await issuePasswordToken({ userId: parent.id, purpose: 'SETUP', createdById: null })

    const view = await inspectPasswordLink(token)
    expect(view).toMatchObject({ ok: true, email: parent.email, purpose: 'SETUP' })
    if (view.ok) expect(view.children).toEqual([`${child.firstName} ${child.lastName}`])
  })

  it('refuse a weak password without spending the link', async () => {
    const parent = await createParent()
    const { token } = await issuePasswordToken({ userId: parent.id, purpose: 'SETUP', createdById: null })

    const weak = await setPasswordWithLink({ token, password: '12345678', confirm: '12345678' })
    expect(weak.ok).toBe(false)
    const strong = await setPasswordWithLink({ token, password: GOOD, confirm: GOOD })
    expect(strong).toEqual({ ok: true, email: parent.email })
  })

  it('answer the same "invalid" for garbage as for a token that never existed', async () => {
    const a = await inspectPasswordLink('nope')
    const b = await inspectPasswordLink('x'.repeat(43))
    expect(a).toEqual(b)
    expect(a.ok).toBe(false)
  })

  it('throttle one address after a handful of submits', async () => {
    let last: { ok: boolean } = { ok: true }
    for (let i = 0; i < 11; i++) {
      last = await setPasswordWithLink({ token: `bad-${i}`, password: GOOD, confirm: GOOD })
    }
    expect(last).toMatchObject({ ok: false, error: expect.stringMatching(/Previše pokušaja/) })
  })
})

describe('sending a link from a profile', () => {
  it('lets a teacher of the child send it to the PARENT login', async () => {
    const group = await createGroup()
    const { parent, child } = await familyIn(group.id)
    const teacher = await createTeacher()
    await createTeacherAssignment(teacher.id, group.id)
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await sendParentPasswordLink(child.id)
    expect(res).toEqual({ success: true, email: parent.email })
    expect(linkMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: parent.email, purpose: 'SETUP', audience: 'PARENT' }),
    )
    const token = await db.passwordToken.findFirstOrThrow({ where: { userId: parent.id } })
    expect(token.createdById).toBe(teacher.id)
  })

  it('sends RESET wording once the parent has chosen a password', async () => {
    const group = await createGroup()
    const { parent, child } = await familyIn(group.id)
    await db.user.update({ where: { id: parent.id }, data: { passwordSetAt: new Date() } })
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    await sendParentPasswordLink(child.id)
    expect(linkMailMock).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'RESET' }))
  })

  it('404s for a teacher who cannot open the child', async () => {
    const group = await createGroup()
    const { parent, child } = await familyIn(group.id)
    const stranger = await createTeacher()
    mockSession({ id: stranger.id, role: 'TEACHER' })

    await expect(sendParentPasswordLink(child.id)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(await db.passwordToken.count({ where: { userId: parent.id } })).toBe(0)
  })

  it('says so when the child has no parent login', async () => {
    const child = await createStudent()
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const res = await sendParentPasswordLink(child.id)
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/nema roditeljski račun/) })
  })

  it('stops after three sends an hour to one login', async () => {
    const group = await createGroup()
    const { child } = await familyIn(group.id)
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    for (let i = 0; i < 3; i++) expect((await sendParentPasswordLink(child.id)).success).toBe(true)
    const fourth = await sendParentPasswordLink(child.id)
    expect(fourth).toMatchObject({ success: false, error: expect.stringMatching(/3 puta/) })
    expect(linkMailMock).toHaveBeenCalledTimes(3)
  })

  it('reports a mail that did not go out instead of claiming success', async () => {
    const teacher = await createTeacher()
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    linkMailMock.mockResolvedValueOnce(false)

    const res = await sendStaffPasswordLink(teacher.id)
    expect(res.success).toBe(false)
  })
})

describe('creating a teacher', () => {
  it('stores no readable password and mails a setup link', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })
    const email = `nova.nastavnica.${Date.now()}@test.hr`

    const res = await createTeacherAction({ email, firstName: 'Nova', lastName: 'Nastavnica' })
    expect(res).toMatchObject({ success: true, emailSent: true })
    const row = await db.user.findUniqueOrThrow({ where: { email } })
    expect(row.plainPassword).toBeNull()
    expect(row.passwordSetAt).toBeNull()
    expect(await db.passwordToken.count({ where: { userId: row.id, purpose: 'SETUP' } })).toBe(1)
  })
})

describe('changing your own password (staff)', () => {
  it('needs the current password', async () => {
    const teacher = await createTeacher()
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await changeOwnPassword({ current: 'krivo', password: GOOD, confirm: GOOD })
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/Trenutna lozinka/) })
  })

  it('sets the password, ends other sessions and kills any unused link', async () => {
    const teacher = await createTeacher()
    await issuePasswordToken({ userId: teacher.id, purpose: 'RESET', createdById: null })
    mockSession({ id: teacher.id, role: 'TEACHER' })

    const res = await changeOwnPassword({ current: teacher.plainPassword, password: GOOD, confirm: GOOD })
    expect(res).toEqual({ success: true })
    const after = await db.user.findUniqueOrThrow({ where: { id: teacher.id } })
    expect(await bcrypt.compare(GOOD, after.passwordHash)).toBe(true)
    expect(after.sessionVersion).toBe(teacher.sessionVersion + 1)
    expect(after.passwordSetAt).not.toBeNull()
    expect(
      await db.passwordToken.count({
        where: { userId: teacher.id, usedAt: null, expiresAt: { gt: new Date() } },
      }),
    ).toBe(0)
  })

  it('is closed to a parent — a parent changes theirs through a link', async () => {
    const parent = await createParent()
    mockSession({ id: parent.id, role: 'PARENT' })
    await expect(
      changeOwnPassword({ current: parent.plainPassword, password: GOOD, confirm: GOOD }),
    ).rejects.toThrow(/NEXT_REDIRECT/)
  })
})

describe('readable passwords', () => {
  it('cannot be stored for anyone but the classroom login — the database refuses', async () => {
    const teacher = await createTeacher()
    await expect(
      db.user.update({ where: { id: teacher.id }, data: { plainPassword: 'tajna' } }),
    ).rejects.toThrow()
    const classroom = await classroomAccount('SPLIT')
    expect(classroom.plainPassword).not.toBeNull()
  })
})
