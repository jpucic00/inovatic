import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * The unit tier covers `retryReadOnce` as a function; this file covers the
 * WIRING — that the `db` every action imports really routes reads through it.
 * Killing the backends from a second client reproduces what a Neon
 * autosuspend does to the pooled connections `db` is holding.
 */

const killer = new PrismaClient()

async function dropOtherConnections() {
  await killer.$executeRaw`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()`
}

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await killer.$disconnect()
})

describe('db — dropped pooled connection', () => {
  it('retries a read once and answers as if nothing happened', async () => {
    const expected = await db.user.count()
    await dropOtherConnections()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(db.user.count()).resolves.toBe(expected)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/retrying User\.count/))
  })
})
