import { db } from '@/lib/db'
import { toDateKey } from '@/lib/session-dates'

/**
 * Loads all holidays for a school year and returns their dates as a Set of
 * YYYY-MM-DD keys — the canonical form expected by
 * `computeExpectedSessions({ holidayDates })`.
 *
 * Lives outside `session-dates.ts` so the date-math helpers stay Prisma-free
 * and unit-testable without a DB mock.
 */
export async function loadHolidayDateKeys(schoolYear: string): Promise<Set<string>> {
  const rows = await db.schoolYearHoliday.findMany({
    where: { schoolYear },
    select: { date: true },
  })
  return new Set(rows.map((r) => toDateKey(r.date)))
}
