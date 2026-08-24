import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * The searchable columns of each admin list, as literal SQL identifiers.
 *
 * These are the ONLY strings interpolated into the statement below with
 * `Prisma.raw`, which is what makes that safe — what the admin types is bound
 * as a parameter and never reaches an identifier position.
 */
const SEARCH_COLUMNS = {
  Inquiry: ['parentName', 'childFirstName', 'childLastName', 'parentEmail'],
  User: ['firstName', 'lastName', 'username'],
} as const

type SearchableTable = keyof typeof SEARCH_COLUMNS

/**
 * Every whitespace-separated token must land in SOME column. A person's full
 * name spans two of them ("Petra" in `childFirstName`, "Testić" in
 * `childLastName`), so matching the whole string against each column finds
 * nothing — and the full name off the upit mail is the natural staff search.
 */
function searchTokens(search: string | undefined): string[] {
  return search?.trim().split(/\s+/).filter(Boolean) ?? []
}

/**
 * A `%` or `_` typed into a search box is a literal character to the person
 * typing it. Prisma's `contains` escapes them on our behalf; a hand-built LIKE
 * pattern has to do it itself, or one stray `%` quietly matches the whole
 * table and reads as a broken filter rather than a wildcard.
 */
function likePattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * A `where` fragment narrowing a list to the rows matching `search`, compared
 * case- AND accent-insensitively — or `null` when nothing was typed, which is
 * "no search filter" and never "no matches".
 *
 * `ILIKE` folds case but not accents, so "Testic" returned an empty table for a
 * child stored as "Testić"; in Croatian, on staff keyboards of assorted layouts,
 * that is the failure that reads as missing data. `unaccent()` folds both sides,
 * so either spelling finds either spelling.
 *
 * It costs a raw statement because Prisma's query builder cannot put a function
 * call on the left of a comparison. Only the *predicate* moves — the ids come
 * back and the caller intersects them into its own `where`, so tenant scoping,
 * the school-year filter, ordering and paging all stay in Prisma where they can
 * be read. The id list is deliberately unbounded: it is only ever as large as
 * the table, and both of these are association-sized.
 */
export async function unaccentSearchFilter(
  table: SearchableTable,
  search: string | undefined,
): Promise<{ id: { in: string[] } } | null> {
  const tokens = searchTokens(search)
  if (tokens.length === 0) return null

  const conditions = tokens.map((token) => {
    const pattern = likePattern(token)
    return Prisma.sql`(${Prisma.join(
      SEARCH_COLUMNS[table].map(
        (column) =>
          Prisma.sql`unaccent(${Prisma.raw(`"${column}"`)}) ILIKE unaccent(${pattern})`,
      ),
      ' OR ',
    )})`
  })

  const rows = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.join(conditions, ' AND ')}`,
  )
  return { id: { in: rows.map((row) => row.id) } }
}
