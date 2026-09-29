/**
 * The one-time setup-link mail to staff on the deploy that ships password
 * links. Like the release notes it runs on every server start, so the tests pin
 * "exactly once": the claim, a repeat start, two starts at once, and the one
 * case allowed to give the claim back.
 *
 * Recipients are asserted by membership: the tier shares one database, so other
 * files' admins and teachers are legitimately in the send too.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { createAdmin, createParent, createStudent, createTeacher } from './helpers/factory'

type LinkSender = typeof import('@/lib/email').sendPasswordLinkEmail

const { sendPasswordLinkEmail } = vi.hoisted(() => ({ sendPasswordLinkEmail: vi.fn<LinkSender>() }))

vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
  return { ...actual, sendPasswordLinkEmail }
})

const { sendPasswordRolloutToStaff, ROLLOUT_KEY } = await import('@/lib/password-rollout')

// Every staff member left in the shared database is mailed on each run.
const SLOW = 60_000

const recipients = () => sendPasswordLinkEmail.mock.calls.map((call) => call[0].to)
const receipt = () => db.releaseAnnouncement.findUnique({ where: { version: ROLLOUT_KEY } })

beforeEach(async () => {
  await db.releaseAnnouncement.deleteMany({ where: { version: ROLLOUT_KEY } })
  sendPasswordLinkEmail.mockReset()
  sendPasswordLinkEmail.mockResolvedValue(true)
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_SEND_THROTTLE_MS = '0'
})

afterAll(async () => {
  await db.releaseAnnouncement.deleteMany({ where: { version: ROLLOUT_KEY } })
})

describe('sendPasswordRolloutToStaff', () => {
  it('without a mail key it neither sends nor claims', async () => {
    delete process.env.RESEND_API_KEY
    await sendPasswordRolloutToStaff()
    expect(sendPasswordLinkEmail).not.toHaveBeenCalled()
    expect(await receipt()).toBeNull()
  })

  it('mails a setup link to admins and teachers, each from their own city — and nobody else', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    const teacher = await createTeacher()
    const parent = await createParent()
    const student = await createStudent()
    const departed = await createTeacher({ deletedAt: new Date() })
    const placeholder = await createTeacher({ email: `uvoz-${Date.now()}@teacher.inovatic.local` })
    const alreadySet = await createTeacher()
    await db.user.update({ where: { id: alreadySet.id }, data: { passwordSetAt: new Date() } })

    await sendPasswordRolloutToStaff()

    const to = recipients()
    expect(to).toEqual(expect.arrayContaining([admin.email, teacher.email]))
    for (const skipped of [parent, student, departed, placeholder, alreadySet]) {
      expect(to).not.toContain(skipped.email)
    }
    const adminCall = sendPasswordLinkEmail.mock.calls.find((call) => call[0].to === admin.email)
    expect(adminCall?.[0]).toMatchObject({ city: 'SIBENIK', purpose: 'SETUP', audience: 'STAFF' })

    // A working link, not just a mail: the token row is there and unused.
    const tokens = await db.passwordToken.findMany({ where: { userId: teacher.id } })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({ purpose: 'SETUP', usedAt: null, createdById: null })

    // The default password is untouched — the mail offers, it does not force.
    const after = await db.user.findUniqueOrThrow({ where: { id: teacher.id } })
    expect(after.passwordHash).toBe(teacher.passwordHash)

    expect((await receipt())?.sentCount).toBe(to.length)
  }, SLOW)

  it('a second start sends nothing', async () => {
    const teacher = await createTeacher()
    await sendPasswordRolloutToStaff()
    expect(recipients()).toContain(teacher.email)

    sendPasswordLinkEmail.mockClear()
    await sendPasswordRolloutToStaff()
    expect(sendPasswordLinkEmail).not.toHaveBeenCalled()
  }, SLOW)

  it('two starts at once mail each person once', async () => {
    const teacher = await createTeacher()
    await Promise.all([sendPasswordRolloutToStaff(), sendPasswordRolloutToStaff()])
    expect(recipients().filter((email) => email === teacher.email)).toHaveLength(1)
  }, SLOW)

  it('gives the claim back when nobody was reached, so the next start retries', async () => {
    const teacher = await createTeacher()
    sendPasswordLinkEmail.mockResolvedValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await sendPasswordRolloutToStaff()
    expect(await receipt()).toBeNull()

    sendPasswordLinkEmail.mockReset()
    sendPasswordLinkEmail.mockResolvedValue(true)
    await sendPasswordRolloutToStaff()
    expect(recipients()).toContain(teacher.email)
    expect(await receipt()).not.toBeNull()
  }, SLOW * 2)
})
