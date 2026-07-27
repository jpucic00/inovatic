/**
 * Minimal in-process sliding-window rate limiter.
 *
 * The app runs as a single Railway instance, so an in-memory counter is enough
 * and avoids adding Redis for one public form. It is deliberately best-effort:
 * counters reset on redeploy, which is acceptable for slowing down abuse of a
 * contact form — it is not an authorization control.
 */

const hits = new Map<string, number[]>()

/** Stop unbounded growth if someone cycles keys; oldest buckets go first. */
const MAX_KEYS = 5_000

function prune(now: number, windowMs: number): void {
  for (const [key, times] of hits) {
    const live = times.filter((t) => t > now - windowMs)
    if (live.length === 0) hits.delete(key)
    else hits.set(key, live)
  }
  if (hits.size <= MAX_KEYS) return
  for (const key of [...hits.keys()].slice(0, hits.size - MAX_KEYS)) hits.delete(key)
}

/**
 * `true` when the call is allowed, and it counts against the quota. A rejected
 * call is **not** recorded, so hammering can't extend a client's own lockout.
 */
export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const live = (hits.get(key) ?? []).filter((t) => t > now - windowMs)
  if (live.length >= limit) {
    hits.set(key, live)
    return false
  }
  live.push(now)
  hits.set(key, live)
  if (hits.size > MAX_KEYS) prune(now, windowMs)
  return true
}

/** Test seam — never called in production code. */
export function resetRateLimits(): void {
  hits.clear()
}
