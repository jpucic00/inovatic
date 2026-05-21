/**
 * Compute how many open spots a ScheduledGroup currently has.
 *
 * `activeEnrollments` is the sum of confirmed students enrolled into the
 * currently-relevant module (or the whole group for radionice) and the
 * inquiries still reserving a spot (status not DECLINED or ACCOUNT_CREATED).
 *
 * Returns `Math.max(0, capacity - activeEnrollments)` so overflow never goes
 * negative — useful for "X slobodnih" copy and for the `isFull` boolean.
 */
export function computeAvailableSpots(capacity: number, activeEnrollments: number): number {
  return Math.max(0, capacity - activeEnrollments)
}
