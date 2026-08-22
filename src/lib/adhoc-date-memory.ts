/**
 * Per-tab memory of hand-added session dates on the Dolazak tab.
 *
 * "Dodaj datum ručno" creates nothing on the server — a session date becomes
 * real only once evidencija is saved and Attendance rows exist for it. Until
 * then the date is a draft, and React state alone lost it on any navigation:
 * the group tabs are separate routes, so opening Materijali unmounted the
 * marker and the date read as deleted.
 *
 * `sessionStorage`, per group, gives the draft the lifetime of the sitting —
 * it survives tab switches and reloads inside one browser tab and deliberately
 * dies with it. That expiry doubles as the delete path: there is no UI for
 * removing a mistyped date, and closing the tab is the escape hatch. Unlike
 * the admin filter memory this key carries no user id — the Dolazak page is
 * already gated per group (`assertTeacherOwnsGroup`), and a planned extra
 * termin is a fact about the group, not about whoever typed it.
 */

const KEY_PREFIX = 'inovatic:adhoc-dates'
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function memoryKey(groupId: string): string {
  return `${KEY_PREFIX}:${groupId}`
}

function storage(): Storage | null {
  // Server render, and Safari private mode, where touching sessionStorage
  // throws rather than returning null.
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * The remembered draft dates for a group, minus anything in `serverKnown` —
 * once a date has real attendance rows the server lists it itself, and the
 * pruned survivors are written back so the entry shrinks as dates get saved.
 * Garbage in storage (hand-edited, corrupted) reads as an empty list.
 */
export function readAdhocDates(
  groupId: string,
  serverKnown: ReadonlySet<string>,
): string[] {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(memoryKey(groupId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const dates = [
      ...new Set(
        parsed.filter(
          (v): v is string => typeof v === 'string' && DATE_KEY_RE.test(v),
        ),
      ),
    ].filter((d) => !serverKnown.has(d))
    if (dates.length === 0) store.removeItem(memoryKey(groupId))
    else if (dates.length !== parsed.length) {
      store.setItem(memoryKey(groupId), JSON.stringify(dates))
    }
    return dates
  } catch {
    return []
  }
}

/** Remember `dates` for the group; an empty list clears the entry. */
export function writeAdhocDates(
  groupId: string,
  dates: readonly string[],
): void {
  const store = storage()
  if (!store) return
  try {
    if (dates.length === 0) store.removeItem(memoryKey(groupId))
    else store.setItem(memoryKey(groupId), JSON.stringify(dates))
  } catch {
    // Quota or a locked-down browser — the draft date is a convenience, and
    // losing it is not worth breaking the marking flow over.
  }
}
