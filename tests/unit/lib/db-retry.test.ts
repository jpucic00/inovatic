import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRetryableConnectionError, retryReadOnce } from '@/lib/db-retry'

const closed = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' })
const unreachable = Object.assign(new Error("Can't reach database server"), { errorCode: 'P1001' })
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

function failOnceWith(error: unknown) {
  return vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok')
}

describe('isRetryableConnectionError', () => {
  it('recognises a dropped connection on either error shape', () => {
    expect(isRetryableConnectionError(closed)).toBe(true)
    expect(isRetryableConnectionError(unreachable)).toBe(true)
  })

  it('ignores every other error', () => {
    expect(isRetryableConnectionError(uniqueViolation)).toBe(false)
    expect(isRetryableConnectionError(new Error('boom'))).toBe(false)
    expect(isRetryableConnectionError('P1017')).toBe(false)
    expect(isRetryableConnectionError(null)).toBe(false)
  })
})

describe('retryReadOnce', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('passes a successful read straight through', async () => {
    const run = vi.fn().mockResolvedValue('ok')
    await expect(retryReadOnce('findMany', 'User', run)).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it.each(['findUnique', 'findMany', 'count', 'groupBy'])(
    'retries %s once after a dropped connection',
    async operation => {
      const run = failOnceWith(closed)
      await expect(retryReadOnce(operation, 'User', run)).resolves.toBe('ok')
      expect(run).toHaveBeenCalledTimes(2)
    },
  )

  it('retries a read that could not reach a waking database', async () => {
    const run = failOnceWith(unreachable)
    await expect(retryReadOnce('findFirst', 'User', run)).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it.each(['create', 'update', 'upsert', 'delete', 'updateMany', '$executeRaw', '$queryRaw'])(
    'never retries %s — it may already have reached the database',
    async operation => {
      const run = failOnceWith(closed)
      await expect(retryReadOnce(operation, 'User', run)).rejects.toBe(closed)
      expect(run).toHaveBeenCalledTimes(1)
    },
  )

  it('does not retry a read that failed for any other reason', async () => {
    const run = failOnceWith(uniqueViolation)
    await expect(retryReadOnce('findMany', 'User', run)).rejects.toBe(uniqueViolation)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries only once and surfaces the second failure', async () => {
    const run = vi.fn().mockRejectedValue(closed)
    await expect(retryReadOnce('findMany', 'User', run)).rejects.toBe(closed)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
