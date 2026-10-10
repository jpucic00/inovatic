/**
 * Minimal in-process sliding-window rate limiter.
 *
 * The app runs as a single Railway instance, so an in-memory counter is enough
 * and avoids adding Redis for one public form. It is deliberately best-effort:
 * counters reset on redeploy, which is acceptable for slowing down abuse of a
 * contact form — it is not an authorization control.
 */

/** Each bucket remembers its own window: one map serves limiters of 15 min
 *  and 1 h alike, and pruning one by another's window would drop live hits. */
type Bucket = { windowMs: number; times: number[] }

const hits = new Map<string, Bucket>()

/** Stop unbounded growth if someone cycles keys. */
const MAX_KEYS = 5_000
/** Overflow trims below the cap, so the next inserts do not each pay for a sort. */
const EVICT_TO = 4_500

function liveTimes(key: string, windowMs: number, now: number): number[] {
  return (hits.get(key)?.times ?? []).filter((t) => t > now - windowMs)
}

/**
 * Drops expired hits, each by its own bucket's window. If that is not enough,
 * evicts the buckets with the FEWEST live hits first (oldest last hit breaks a
 * tie): a flood of one-hit junk keys must never push out a locked account,
 * which by definition holds the most.
 */
function prune(now: number): void {
  for (const [key, bucket] of hits) {
    const live = bucket.times.filter((t) => t > now - bucket.windowMs)
    if (live.length === 0) hits.delete(key)
    else bucket.times = live
  }
  // EVICT_TO, not MAX_KEYS: an expiry pass that frees only a few keys would
  // otherwise leave the map at the cap, and every new key would scan it again.
  if (hits.size <= EVICT_TO) return
  const lastHit = (bucket: Bucket) => bucket.times.at(-1) ?? 0
  const byWeight = [...hits].sort(
    ([, a], [, b]) => a.times.length - b.times.length || lastHit(a) - lastHit(b),
  )
  for (const [key] of byWeight.slice(0, hits.size - EVICT_TO)) hits.delete(key)
}

function store(key: string, windowMs: number, times: number[], now: number): void {
  hits.set(key, { windowMs, times })
  if (hits.size > MAX_KEYS) prune(now)
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
  const live = liveTimes(key, windowMs, now)
  if (live.length >= limit) {
    hits.set(key, { windowMs, times: live })
    return false
  }
  live.push(now)
  store(key, windowMs, live, now)
  return true
}

/**
 * `allowRequest` split in two, for limits that count only SOME calls — a login
 * throttle counts failures, and a successful login must not use up the quota.
 * `isRateLimited` peeks without recording; `recordHit` records unconditionally.
 */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  return liveTimes(key, windowMs, now).length >= limit
}

/** Records one hit; returns how many are live in the window, this one included. */
export function recordHit(key: string, windowMs: number, now: number = Date.now()): number {
  const live = liveTimes(key, windowMs, now)
  live.push(now)
  store(key, windowMs, live, now)
  return live.length
}

/** Takes back one hit recorded at `at` by {@link recordHit} — a reservation that turned out not to count. */
export function releaseHit(key: string, at: number): void {
  const times = hits.get(key)?.times
  const index = times?.indexOf(at) ?? -1
  if (!times || index === -1) return
  times.splice(index, 1)
  if (times.length === 0) hits.delete(key)
}

export function clearHits(key: string): void {
  hits.delete(key)
}

/** Test seam — never called in production code. */
export function resetRateLimits(): void {
  hits.clear()
}
