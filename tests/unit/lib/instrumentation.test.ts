/**
 * The three gates that keep the release e-mail off every non-production machine.
 *
 * Worth a test of its own precisely because the obvious safety net is NOT one of
 * them: `announcePendingReleases` no-ops without `RESEND_API_KEY`, but this
 * machine's `.env.local` holds a working key, so a dev boot would announce to
 * whatever admins the local seed created. `register()` is the only thing
 * standing between `npm run dev` and a real e-mail to a real administrator, and
 * the failure is silent in the direction that matters — nobody notices a gate
 * that stopped working until the mail has already gone out.
 *
 * The non-await is pinned here too. `register()` runs before the first request
 * is served, so awaiting an unreachable Resend would hold up Railway's
 * healthcheck and fail the deploy — a release nobody can read is a smaller
 * problem than a deploy that does not land.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { announcePendingReleases } = vi.hoisted(() => ({
  announcePendingReleases: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/release-announce', () => ({ announcePendingReleases }))

const ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  RELEASE_ANNOUNCE_DISABLED: process.env.RELEASE_ANNOUNCE_DISABLED,
}

/** `NODE_ENV` is readonly in the Next type surface; tests own the process. */
function setEnv(key: keyof typeof ORIGINAL, value: string | undefined) {
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[key]
  else (process.env as Record<string, string | undefined>)[key] = value
}

/** A production Railway boot, which every case below varies one field of. */
function productionBoot() {
  setEnv('NODE_ENV', 'production')
  setEnv('NEXT_RUNTIME', 'nodejs')
  setEnv('RELEASE_ANNOUNCE_DISABLED', undefined)
}

async function register() {
  // Re-imported per test so the module never caches an env read.
  vi.resetModules()
  const mod = await import('@/instrumentation')
  await mod.register()
}

beforeEach(() => {
  announcePendingReleases.mockClear()
  announcePendingReleases.mockImplementation(() => Promise.resolve())
  productionBoot()
})

afterEach(() => {
  for (const key of Object.keys(ORIGINAL) as (keyof typeof ORIGINAL)[]) {
    setEnv(key, ORIGINAL[key])
  }
  vi.restoreAllMocks()
})

describe('register()', () => {
  it('announces on a production Node boot — the one case that should send', async () => {
    await register()
    expect(announcePendingReleases).toHaveBeenCalledTimes(1)
  })

  it('stays silent outside production, whatever the Resend key says', async () => {
    for (const env of ['development', 'test']) {
      announcePendingReleases.mockClear()
      setEnv('NODE_ENV', env)
      await register()
      expect(announcePendingReleases, `NODE_ENV=${env}`).not.toHaveBeenCalled()
    }
  })

  it('stays silent when RELEASE_ANNOUNCE_DISABLED is set', async () => {
    // The escape hatch for `npm run build && npm start` on a laptop, which is
    // the one local case that reads real production credentials.
    setEnv('RELEASE_ANNOUNCE_DISABLED', '1')
    await register()
    expect(announcePendingReleases).not.toHaveBeenCalled()
  })

  it('stays silent on the edge runtime, where Prisma cannot run', async () => {
    // Not a mail concern but a crash one: reaching the announcer here is a
    // boot-time throw, not a wrong e-mail.
    for (const runtime of ['edge', undefined]) {
      announcePendingReleases.mockClear()
      setEnv('NEXT_RUNTIME', runtime)
      await register()
      expect(announcePendingReleases, `NEXT_RUNTIME=${runtime}`).not.toHaveBeenCalled()
    }
  })

  it('does not wait for the announcer, so a dead Resend cannot fail the deploy', async () => {
    let settle: (() => void) | undefined
    announcePendingReleases.mockImplementation(
      () => new Promise<void>((resolve) => { settle = resolve }),
    )

    // Resolves while the announcer is still in flight. If `register` ever
    // awaited it, this would hang until the test timed out.
    await register()
    expect(announcePendingReleases).toHaveBeenCalledTimes(1)
    expect(settle).toBeTypeOf('function')
    settle?.()
  })

  it('swallows an announcer rejection instead of taking the process down', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    announcePendingReleases.mockImplementation(() =>
      Promise.reject(new Error('P1001: Can\'t reach database server')),
    )

    await expect(register()).resolves.toBeUndefined()
    // The rejection is handled on the floating promise, a microtask later.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(logged).toHaveBeenCalled()
  })
})
