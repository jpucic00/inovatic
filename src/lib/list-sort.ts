/**
 * Sorting for admin lists. Client-safe: the paginated lists sort on the server
 * (a browser only ever holds one page, so sorting there reorders 20 rows of a
 * longer list), while `<DataTable>` still sorts the unpaginated ones in place —
 * both through `compareSortValues`, so a column orders the same either way.
 */

export type SortDir = 'asc' | 'desc'

export type ListSort<K extends string = string> = { key: K; dir: SortDir }

export type SortValue = string | number

export const SORT_PARAM = 'sort'
export const DIR_PARAM = 'dir'

/** A sort from the URL, or `undefined` for anything it does not recognise. */
export function parseListSort<K extends string>(
  keys: readonly K[],
  sort: string | undefined,
  dir: string | undefined,
): ListSort<K> | undefined {
  if (!sort || !(keys as readonly string[]).includes(sort)) return undefined
  return { key: sort as K, dir: dir === 'desc' ? 'desc' : 'asc' }
}

/** Numbers numerically, everything else by the Croatian alphabet (Č after C). */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'hr')
}

/**
 * A sorted copy. `Array.prototype.sort` is stable, so rows the column cannot
 * tell apart keep the order they came in — the list's default order.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: ListSort<K>,
  valueOf: (key: K, row: T) => SortValue,
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort(
    (a, b) => sign * compareSortValues(valueOf(sort.key, a), valueOf(sort.key, b)),
  )
}

/** Header click cycle: off → ascending → descending → off. */
export function nextListSort(
  current: ListSort | undefined,
  key: string,
): ListSort | undefined {
  if (current?.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return undefined
}

/**
 * The query string after clicking `key`'s header. Every filter is kept, and
 * `page` is dropped: page 3 of a list in another order is an arbitrary slice.
 */
export function sortQueryFor(
  params: URLSearchParams,
  current: ListSort | undefined,
  key: string,
): string {
  const sp = new URLSearchParams(params)
  sp.delete('page')
  const next = nextListSort(current, key)
  if (next) {
    sp.set(SORT_PARAM, next.key)
    sp.set(DIR_PARAM, next.dir)
  } else {
    sp.delete(SORT_PARAM)
    sp.delete(DIR_PARAM)
  }
  return sp.toString()
}
