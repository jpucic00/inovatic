/**
 * The once-only guarantee behind the release e-mail.
 *
 * `announcePendingReleases` runs on every server start — every deploy, and
 * every crash restart on top of that — so "sends the mail" is the easy half and
 * "cannot send it twice" is the half worth testing. The claim is a row in
 * `ReleaseAnnouncement` whose primary key is the version string, taken before
 * the first send rather than after the last, and these tests pin exactly that
 * ordering: two concurrent boots, a repeat call, and the one case that is
 * allowed to give a claim back.
 *
 * Recipients are asserted by membership rather than by count. The integration
 * tier shares one database with no per-file cleanup, so other files' admins are
 * legitimately in this send too; what matters is that MY admins are in it and
 * my teacher, student and soft-deleted admin are not.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { createAdmin, createStudent, createTeacher } from './helpers/factory'
import type { ReleaseNote } from '@/lib/releases'

type ReleaseSender = typeof import('@/lib/email').sendReleaseNotesEmail

const { sendReleaseNotesEmail, releases } = vi.hoisted(() => ({
  sendReleaseNotesEmail: vi.fn<ReleaseSender>(),
  // Stands in for the real changelog: the module under test reads this array
  // live, so a test stages its own releases by pushing into it.
  releases: [] as ReleaseNote[],
}))

vi.mock('@/lib/email', () => ({ sendReleaseNotesEmail }))
vi.mock('@/lib/releases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/releases')>()),
  RELEASES: releases,
}))

const { announcePendingReleases } = await import('@/lib/release-announce')

const userIds: string[] = []
const versions: string[] = []
let seq = 0

/** Unique across the shared database — `version` is a primary key with no cleanup between files. */
function stageRelease(overrides: Partial<ReleaseNote> = {}): ReleaseNote {
  const release: ReleaseNote = {
    version: `9.${Date.now() % 100000}.${seq++}`,
    date: new Date().toISOString().slice(0, 10),
    title: 'Testna objava.',
    changes: ['Nešto novo.'],
    ...overrides,
  }
  releases.push(release)
  versions.push(release.version)
  return release
}

async function admin() {
  const user = await createAdmin()
  userIds.push(user.id)
  return user
}

function recipients(): string[] {
  return sendReleaseNotesEmail.mock.calls.map((call) => call[0].to)
}

beforeEach(() => {
  releases.length = 0
  sendReleaseNotesEmail.mockReset()
  sendReleaseNotesEmail.mockResolvedValue(true)
  process.env.RESEND_API_KEY = 're_test_key'
  // Real sends are paced for Resend's rate limit; the tier has no time for it.
  process.env.EMAIL_SEND_THROTTLE_MS = '0'
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await db.releaseAnnouncement.deleteMany({ where: { version: { in: versions } } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })
})

describe('announcePendingReleases', () => {
  it('mails the administrators and nobody else, then records the receipt', async () => {
    const [first, second] = [await admin(), await admin()]
    const teacher = await createTeacher()
    const student = await createStudent()
    const departed = await createAdmin({ deletedAt: new Date() })
    userIds.push(teacher.id, student.id, departed.id)

    const release = stageRelease()
    await announcePendingReleases()

    const to = recipients()
    expect(to).toContain(first.email)
    expect(to).toContain(second.email)
    expect(to).not.toContain(teacher.email)
    expect(to).not.toContain(student.email)
    // A former colleague keeps their row for the audit trail; they do not keep
    // the mail.
    expect(to).not.toContain(departed.email)

    // The note that goes out is the one in the changelog, not a copy.
    expect(sendReleaseNotesEmail.mock.calls[0][0].release).toEqual(release)

    const receipt = await db.releaseAnnouncement.findUnique({
      where: { version: release.version },
    })
    expect(receipt?.sentCount).toBe(to.length)
    expect(receipt?.failedCount).toBe(0)
  })

  it('stays silent on the next start', async () => {
    const recipient = await admin()
    stageRelease()

    await announcePendingReleases()
    expect(recipients()).toContain(recipient.email)

    sendReleaseNotesEmail.mockClear()
    await announcePendingReleases()
    expect(sendReleaseNotesEmail).not.toHaveBeenCalled()
  })

  it('sends once when two instances boot together', async () => {
    const recipient = await admin()
    stageRelease()

    await Promise.all([announcePendingReleases(), announcePendingReleases()])

    // The loser of the race sees a unique violation on the claim and skips —
    // this is the assertion the whole primary-key design exists for.
    expect(recipients().filter((to) => to === recipient.email)).toHaveLength(1)
  })

  it('claims nothing without a mail provider, so production can still announce', async () => {
    await admin()
    const release = stageRelease()
    delete process.env.RESEND_API_KEY

    await announcePendingReleases()

    expect(sendReleaseNotesEmail).not.toHaveBeenCalled()
    // A receipt written by a keyless environment would silence the real send
    // forever if that database were ever promoted.
    expect(
      await db.releaseAnnouncement.findUnique({ where: { version: release.version } }),
    ).toBeNull()
  })

  it('gives the claim back when it could not reach a single administrator', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const recipient = await admin()
    const release = stageRelease()
    sendReleaseNotesEmail.mockRejectedValue(new Error('Resend: unreachable'))

    await announcePendingReleases()
    expect(
      await db.releaseAnnouncement.findUnique({ where: { version: release.version } }),
    ).toBeNull()

    // Nobody was mailed, so the retry cannot duplicate anything.
    sendReleaseNotesEmail.mockReset()
    sendReleaseNotesEmail.mockResolvedValue(true)
    await announcePendingReleases()
    expect(recipients()).toContain(recipient.email)
  })

  it('keeps the claim when some mails got through', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = await admin()
    const refused = await admin()
    const delivered = await admin()
    const release = stageRelease()
    sendReleaseNotesEmail.mockImplementation(async ({ to }) => {
      if (to === failing.email) throw new Error('Resend: unreachable')
      // A sender returning false (no key at the client) is a non-delivery too.
      return to !== refused.email
    })

    await announcePendingReleases()

    const receipt = await db.releaseAnnouncement.findUnique({
      where: { version: release.version },
    })
    // Re-sending would mail everyone who already has it a second time, which is
    // worse than one administrator missing the note.
    expect(receipt).not.toBeNull()
    expect(receipt?.failedCount).toBe(2)
    expect(recipients()).toContain(delivered.email)

    sendReleaseNotesEmail.mockClear()
    await announcePendingReleases()
    expect(sendReleaseNotesEmail).not.toHaveBeenCalled()
  })

  it('ignores a release too old to be news', async () => {
    await admin()
    const stale = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
    const release = stageRelease({ date: stale })

    await announcePendingReleases()

    // A database restored from an older backup loses its receipts; without this
    // window the next start would mail the entire changelog.
    expect(sendReleaseNotesEmail).not.toHaveBeenCalled()
    expect(
      await db.releaseAnnouncement.findUnique({ where: { version: release.version } }),
    ).toBeNull()
  })

  it('announces an older pending release before a newer one', async () => {
    const recipient = await admin()
    const older = stageRelease({ version: `9.${Date.now() % 100000}.100` })
    const newer = stageRelease({ version: `9.${Date.now() % 100000}.101` })

    await announcePendingReleases()

    const mine = sendReleaseNotesEmail.mock.calls
      .filter((call) => call[0].to === recipient.email)
      .map((call) => call[0].release.version)
    expect(mine).toEqual([older.version, newer.version])
  })
})
