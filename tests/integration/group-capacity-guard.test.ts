/**
 * Retry contract of `runWithGroupCapacityGuard` (Flux tbl2l3d).
 *
 * Every seat-taking write (public upit, admin enrollment) runs inside this
 * wrapper, and the whole capacity model depends on two things nothing tested
 * before: the transaction is Serializable, and a P2034 serialization conflict
 * is re-rolled exactly once. A regression here does not fail any other test —
 * it just silently drops the retry and turns a routine conflict into a visible
 * error for a parent mid-signup.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { runWithGroupCapacityGuard } from '@/lib/group-capacity'

type TxFn = (tx: never) => Promise<unknown>

const p2034 = () =>
  new Prisma.PrismaClientKnownRequestError('serialization conflict', {
    code: 'P2034',
    clientVersion: 'test',
  })

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })

/**
 * Replace `db.$transaction` with `impl`. The stub runs the callback before
 * failing, mirroring a real serialization conflict: Postgres accepts the reads
 * and writes, then refuses at commit.
 */
function stubTransaction(impl: (fn: TxFn, attempt: number) => Promise<unknown>) {
  let attempts = 0
  return vi.spyOn(db, '$transaction').mockImplementation(((fn: TxFn) => {
    attempts += 1
    return impl(fn, attempts)
  }) as unknown as typeof db.$transaction)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runWithGroupCapacityGuard', () => {
  it('runs the body in a Serializable transaction', async () => {
    const spy = vi.spyOn(db, '$transaction')

    const count = await runWithGroupCapacityGuard((tx) => tx.inquiry.count())

    expect(typeof count).toBe('number')
    expect(spy).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
  })

  it('retries once on P2034 and returns the second attempt’s result', async () => {
    stubTransaction(async (fn, attempt) => {
      const result = await fn(undefined as never)
      if (attempt === 1) throw p2034()
      return result
    })
    const body = vi.fn(async () => 'upisan')

    await expect(runWithGroupCapacityGuard(body)).resolves.toBe('upisan')
    expect(body).toHaveBeenCalledTimes(2)
  })

  it('rethrows when the retry also hits P2034 — and as an error the caller can still recognise', async () => {
    stubTransaction(async (fn) => {
      await fn(undefined as never)
      throw p2034()
    })
    const body = vi.fn(async () => 'upisan')

    const err = await runWithGroupCapacityGuard(body).catch((e: unknown) => e)

    expect(body).toHaveBeenCalledTimes(2)
    // The guard does NOT swallow a second conflict, so submitInquiry's own
    // P2034 branch ('Pokušajte ponovno.') is the live "retry failed too" arm
    // rather than dead code — it matches exactly this predicate.
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe('P2034')
  })

  it('does not retry another Prisma error', async () => {
    stubTransaction(async (fn) => {
      await fn(undefined as never)
      throw p2002()
    })
    const body = vi.fn(async () => 'upisan')

    await expect(runWithGroupCapacityGuard(body)).rejects.toMatchObject({ code: 'P2002' })
    expect(body).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-Prisma error', async () => {
    stubTransaction(async (fn) => {
      await fn(undefined as never)
      throw new Error('connection reset')
    })
    const body = vi.fn(async () => 'upisan')

    await expect(runWithGroupCapacityGuard(body)).rejects.toThrow('connection reset')
    expect(body).toHaveBeenCalledTimes(1)
  })
})
