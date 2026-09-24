/**
 * Bucket an ad-hoc / extra session date into one of the per-module sections
 * the teacher attendance UI renders. Returns the index of the first section
 * whose [firstSession, lastSession] window contains `dateKey` (inclusive),
 * or null when the date falls outside every window (→ "Ostali termini").
 *
 * Sections with null bounds (placeholder safety-net entries for groups whose
 * schedule isn't filled in yet) are skipped — they have no window to compare
 * against.
 *
 * String compare works because every key is a canonical YYYY-MM-DD.
 */
export function assignAdhocDateToSection(
  dateKey: string,
  sections: ReadonlyArray<{
    firstSession: string | null
    lastSession: string | null
  }>,
): number | null {
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    if (s.firstSession === null || s.lastSession === null) continue
    if (dateKey >= s.firstSession && dateKey <= s.lastSession) return i
  }
  return null
}

/**
 * The session the Dolazak tab opens on: it follows the calendar. Today's
 * session if there is one, else the most recent one already held (a teacher
 * usually marks after class), else the next one coming up.
 *
 * `dates` must hold every session the tab lists — the probni sat included.
 * Deriving this from the module arc alone opened module 1 all through the
 * probni tjedan, because the trial is not part of the arc.
 */
export function pickDefaultSessionDate(
  dates: ReadonlyArray<string>,
  today: string,
): string {
  let latestPast: string | null = null
  let earliestUpcoming: string | null = null
  for (const d of dates) {
    if (d === today) return today
    if (d < today) {
      if (latestPast === null || d > latestPast) latestPast = d
    } else if (earliestUpcoming === null || d < earliestUpcoming) {
      earliestUpcoming = d
    }
  }
  return latestPast ?? earliestUpcoming ?? today
}
