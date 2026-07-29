/**
 * Month arithmetic for monthly-fee enrollments (COMPETITION programs).
 *
 * A season is a `[startDate, endDate]` range on CourseSeason; the payable items
 * are the calendar months it touches, each represented by its first day at UTC
 * midnight so it round-trips through Prisma's `@db.Date` unchanged.
 *
 * Pure — no Prisma, no clock. The caller supplies "today" where it matters.
 */

/** First day of `date`'s calendar month, at UTC midnight. */
function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/**
 * Every calendar month the season touches, ascending, as `YYYY-MM-01` UTC dates.
 *
 * `from` floors the list at that date's month, which is how a child who joins in
 * January is charged January→June rather than the whole season: they are never
 * shown as owing for months they did not attend. A `from` past the season end
 * yields an empty list (nothing left to bill).
 *
 * Returns [] when either bound is missing — an unplanned season bills nothing
 * rather than guessing.
 */
export function seasonMonths(
  seasonStart: Date | null,
  seasonEnd: Date | null,
  from?: Date | null,
): Date[] {
  if (!seasonStart || !seasonEnd) return []

  let cursor = monthStart(seasonStart)
  const last = monthStart(seasonEnd)
  if (from) {
    const floor = monthStart(from)
    if (floor > cursor) cursor = floor
  }

  const out: Date[] = []
  while (cursor <= last) {
    out.push(cursor)
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }
  return out
}
