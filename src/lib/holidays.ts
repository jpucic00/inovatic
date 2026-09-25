import type { City, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { toDateKey } from '@/lib/session-dates'

/**
 * Loads a city's holidays for a school year and returns their dates as a Set
 * of YYYY-MM-DD keys — the canonical form expected by
 * `computeExpectedSessions({ holidayDates })`.
 *
 * `city` is required: holiday calendars are per-city (a Šibenik closure must
 * never pace Split groups), and callers resolve it from the group/venue or
 * the admin session — never from client input.
 *
 * Lives outside `session-dates.ts` so the date-math helpers stay Prisma-free
 * and unit-testable without a DB mock. Pass `client` to read inside a
 * transaction (the planner reads them under the plan lock).
 */
export async function loadHolidayDateKeys(
  schoolYear: string,
  city: City,
  client: Pick<Prisma.TransactionClient, 'schoolYearHoliday'> = db,
): Promise<Set<string>> {
  const rows = await client.schoolYearHoliday.findMany({
    where: { schoolYear, city },
    select: { date: true },
  })
  return new Set(rows.map((r) => toDateKey(r.date)))
}
