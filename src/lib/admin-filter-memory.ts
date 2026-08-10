/**
 * Per-tab memory of the last filter applied to each admin list.
 *
 * The URL stays the source of truth — this only fills it back in when the admin
 * arrives at a list with no query at all (sidebar click, bookmark, the "Natrag"
 * link on a detail page). Everything a list puts in its query string is
 * remembered verbatim, `page` included: coming back from a student opened on
 * page 3 should land on page 3.
 *
 * `sessionStorage`, not a cookie, for two reasons: it is per-tab, so an admin
 * comparing two filtered lists side by side gets two independent filters
 * instead of one they fight over; and it dies with the tab, so "remembered"
 * never outlives the sitting. The key carries the admin's id on top of that —
 * two people share a machine here (Šibenik has exactly one admin, who is also
 * its only teacher), and a `groupId` remembered by one is meaningless to the
 * other, whose city-scoped list would simply come back empty.
 */

const KEY_PREFIX = 'inovatic:admin-filters'

export function filterMemoryKey(adminId: string, listPath: string): string {
  return `${KEY_PREFIX}:${adminId}:${listPath}`
}

function storage(): Storage | null {
  // Server render, and Safari private mode, where touching sessionStorage
  // throws rather than returning null.
  if (globalThis.window === undefined) return null
  try {
    return globalThis.sessionStorage
  } catch {
    return null
  }
}

/** The query string to restore, or `''` when there is nothing to restore. */
export function readFilterMemory(adminId: string, listPath: string): string {
  if (!adminId) return ''
  try {
    return storage()?.getItem(filterMemoryKey(adminId, listPath)) ?? ''
  } catch {
    return ''
  }
}

/**
 * Pass `''` to record a deliberate clear — writing nothing instead would leave
 * the previous filter in place for the restore effect to put straight back.
 */
export function writeFilterMemory(
  adminId: string,
  listPath: string,
  query: string,
): void {
  if (!adminId) return
  try {
    storage()?.setItem(filterMemoryKey(adminId, listPath), query)
  } catch {
    // Quota or a locked-down browser — sticky filters are a convenience, and
    // losing them is not worth breaking the page over.
  }
}

/**
 * Drops `page` alongside the filter being removed: page 3 of a narrower list is
 * usually past the end, which reads as "removing a filter emptied the table".
 */
export function withoutFilterParam(query: string, key: string): string {
  const sp = new URLSearchParams(query)
  sp.delete(key)
  sp.delete('page')
  return sp.toString()
}
