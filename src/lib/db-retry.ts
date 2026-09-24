// Neon suspends an idle compute, and the pooled connections Prisma was holding
// die with it. The first queries afterwards fail with P1017 ("Server has closed
// the connection") — or P1001 when the wake-up outlasts the connect timeout —
// and Prisma does not retry. One retry is enough: the dead connection is
// discarded and the second attempt opens a fresh one.
//
// Reads only. A write may already have reached the database before the
// connection dropped, and running it twice is worse than surfacing the error.
// Raw queries are excluded for the same reason — `$queryRaw` can hold any SQL.

const RETRYABLE_CODES = new Set(['P1001', 'P1017'])

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

export function isRetryableConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  // PrismaClientKnownRequestError carries `code`, PrismaClientInitializationError `errorCode`.
  const { code, errorCode } = error as { code?: unknown; errorCode?: unknown }
  return (
    (typeof code === 'string' && RETRYABLE_CODES.has(code)) ||
    (typeof errorCode === 'string' && RETRYABLE_CODES.has(errorCode))
  )
}

export async function retryReadOnce<T>(
  operation: string,
  model: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!READ_OPERATIONS.has(operation) || !isRetryableConnectionError(error)) throw error
    console.warn(`db: retrying ${model ?? ''}.${operation} after a dropped connection`)
    return run()
  }
}
