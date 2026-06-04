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
