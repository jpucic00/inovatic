/**
 * Guards on the changelog itself.
 *
 * `src/lib/releases.ts` is the one file in this repo whose audience is not a
 * developer: every line ends up in an e-mail to an administrator, unreviewed by
 * anyone else, on the deploy after it is written. These assertions are what
 * stands between "a sentence about the app" and a pasted commit subject.
 *
 * They iterate `RELEASES`, so they are quiet on an empty changelog and arm
 * themselves the moment `/release` writes the first entry.
 */
import { describe, expect, it } from 'vitest'
import { RELEASES, type ReleaseNote } from '@/lib/releases'

const SEMVER = /^\d+\.\d+\.\d+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function versionOrder(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number)
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number)
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch
}

describe('RELEASES', () => {
  it('uses well-formed versions, and each one only once', () => {
    for (const release of RELEASES) expect(release.version).toMatch(SEMVER)
    const versions = RELEASES.map((r) => r.version)
    // A repeated version silently means "already announced" and the second
    // release is never mailed — the receipt table is keyed on this string.
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('is ordered newest first', () => {
    const versions = RELEASES.map((r) => r.version)
    const descending = [...versions].sort((a, b) => versionOrder(b, a))
    expect(versions).toEqual(descending)
  })

  it('carries a real calendar date', () => {
    for (const release of RELEASES) {
      expect(release.date).toMatch(ISO_DATE)
      // Catches 2026-02-31, which the regex above happily accepts.
      const parsed = new Date(`${release.date}T00:00:00Z`)
      expect(parsed.toISOString().slice(0, 10)).toBe(release.date)
    }
  })

  it('says at least one thing per release', () => {
    for (const release of RELEASES) {
      expect(release.title.trim().length).toBeGreaterThan(0)
      // A release with nothing to tell anyone is a release that should not have
      // been cut — the e-mail would arrive empty.
      expect(release.changes.length).toBeGreaterThan(0)
    }
  })

  it('writes sentences, not fragments', () => {
    for (const release of RELEASES) {
      for (const item of [release.title, ...release.changes]) {
        expect(item).toBe(item.trim())
        expect(item.length).toBeGreaterThan(10)
        // Long enough to be a paragraph is long enough to be skipped.
        expect(item.length).toBeLessThanOrEqual(200)
      }
    }
  })

  it('says nothing an administrator cannot see in the app', () => {
    // Vocabulary that can only have come from the repository. Not exhaustive
    // and not meant to be — it catches the specific failure of pasting a commit
    // subject or a schema field into a note meant for someone who will never
    // open the code.
    const fromTheRepo =
      /\.tsx?\b|`|\bprisma\b|\bmigracij|\bcommit\b|\bdeploy|\bendpoint|\brefactor|\bschema\b|\bnull\b|\bundefined\b|\bbackend\b|\bfrontend\b|\bAPI\b|\bPR\b|\bmerge\b/i

    for (const release of RELEASES) {
      for (const item of [release.title, ...release.changes]) {
        expect(item, `technical wording in "${item}"`).not.toMatch(fromTheRepo)
      }
    }
  })
})
