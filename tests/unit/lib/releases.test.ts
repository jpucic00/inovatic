/**
 * Guards on the changelog itself.
 *
 * `src/lib/releases.ts` is the one file in this repo whose audience is not a
 * developer: every line ends up in an e-mail to an administrator, unreviewed by
 * anyone else, on the deploy after it is written. These rules are what stands
 * between "a sentence about the app" and a pasted commit subject.
 *
 * **Each rule is tested twice, and that split is the point.** `RELEASES` ships
 * empty and stays empty until `/release` writes the first entry, so a suite that
 * only looped over it passed without evaluating a single expectation — the
 * semver check, the ordering comparator and the vocabulary regex had never once
 * executed, and a regex that silently matches nothing looks exactly like a
 * working one until the release that depends on it. So: `describe('the rules')`
 * proves each rule actually accepts and rejects, against fixtures written here;
 * `describe('RELEASES')` applies those same rules to the real changelog and is
 * quiet while it is empty.
 */
import { describe, expect, it } from 'vitest'
import { RELEASES, type ReleaseNote } from '@/lib/releases'

const SEMVER = /^\d+\.\d+\.\d+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Vocabulary that can only have come from the repository. Not exhaustive and
 * not meant to be — it catches the specific failure of pasting a commit subject
 * or a schema field into a note for someone who will never open the code.
 *
 * The identifier arms carry most of the weight, because the give-away is rarely
 * a word from a list — it is `returningMarker` sitting in a Croatian sentence.
 * Both are anchored on a LOWERCASE first letter, which is what keeps the
 * user-facing product names out of it: `RoboCamp`, `WeDo` and `LEGO` are Pascal
 * or upper case and must stay sayable.
 */
const REPO_WORDS =
  /\.tsx?\b|`|\bprisma\b|\bmigracij|\bcommit\b|\bdeploy|\bendpoint|\brefactor|\bschema\b|\bnull\b|\bundefined\b|\bbackend\b|\bfrontend\b|\bAPI\b|\bPR\b|\bmerge\b/i
const CAMEL_CASE = /\b[a-zčćžšđ]+[A-ZČĆŽŠĐ]\w*/
const SNAKE_CASE = /\b[a-z]+_[a-z]+\b/

// ─── The rules, as predicates ────────────────────────────────────────────────

export function isWellFormedVersion(version: string): boolean {
  return SEMVER.test(version)
}

/** ISO shape AND a day that exists — the regex alone accepts 2026-02-31. */
export function isRealCalendarDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

export function versionOrder(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number)
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number)
  return aMajor - bMajor || aMinor - bMinor || aPatch - bPatch
}

export function isNewestFirst(versions: readonly string[]): boolean {
  const descending = [...versions].sort((a, b) => versionOrder(b, a))
  return versions.every((v, i) => v === descending[i])
}

/** Trimmed, long enough to be a sentence, short enough that nobody skips it. */
export function isSentence(text: string): boolean {
  return text === text.trim() && text.length > 10 && text.length <= 200
}

export function readsLikeTheRepository(text: string): boolean {
  return REPO_WORDS.test(text) || CAMEL_CASE.test(text) || SNAKE_CASE.test(text)
}

// ─── The rules prove they accept and reject ──────────────────────────────────

describe('the rules', () => {
  it('accepts a well-formed version and rejects the near-misses', () => {
    for (const good of ['1.0.0', '0.1.0', '10.4.12']) {
      expect(isWellFormedVersion(good), good).toBe(true)
    }
    for (const bad of ['1.2', 'v1.2.0', '1.2.0-rc1', '1.2.0.1', '']) {
      expect(isWellFormedVersion(bad), bad).toBe(false)
    }
  })

  it('rejects a date that looks right but never happened', () => {
    expect(isRealCalendarDate('2026-08-19')).toBe(true)
    expect(isRealCalendarDate('2024-02-29')).toBe(true) // leap year, real
    // The whole reason this is not just a regex:
    expect(isRealCalendarDate('2026-02-31')).toBe(false)
    expect(isRealCalendarDate('2026-13-01')).toBe(false)
    expect(isRealCalendarDate('2025-02-29')).toBe(false) // not a leap year
    expect(isRealCalendarDate('19.08.2026.')).toBe(false)
  })

  it('orders newest first, and notices when it is not', () => {
    expect(isNewestFirst(['2.0.0', '1.10.0', '1.9.0', '1.0.0'])).toBe(true)
    expect(isNewestFirst(['1.0.0', '2.0.0'])).toBe(false)
    // Numeric, not lexicographic — the ordering a string sort gets wrong.
    expect(isNewestFirst(['1.10.0', '1.9.0'])).toBe(true)
    expect(isNewestFirst([])).toBe(true)
  })

  it('tells a sentence from a fragment', () => {
    expect(isSentence('Na profilu djeteta sada piše je li ugovor potpisan.')).toBe(true)
    expect(isSentence('Popravak.')).toBe(false) // too short to say anything
    expect(isSentence(' Vodeći razmak. ')).toBe(false)
    expect(isSentence('a'.repeat(201))).toBe(false)
  })

  it('rejects wording that could only come from the repository', () => {
    for (const bad of [
      'Popravljen prisma schema nakon merge.',
      'Dodan novi endpoint za upise.',
      'Refactor komponente i deploy.',
      'Ispravak u inquiry-form.tsx.',
      // The one a word list alone never catches — an identifier pasted into an
      // otherwise ordinary Croatian sentence.
      'Dodan returningMarker u obavijest o upisu.',
      'Polje parent_email sada se čisti prije slanja.',
    ]) {
      expect(readsLikeTheRepository(bad), bad).toBe(true)
    }

    for (const good of [
      'Na Kalendaru školske godine sada se vidi probni tjedan.',
      'Roditelj na prijavi bira način plaćanja.',
      'U RoboCamp materijalima prvo se prikazuje video.',
      'WeDo 2.0 program sada ima vlastitu stranicu.',
      'Na profilu djeteta stoji oznaka Ugovor potpisan.',
    ]) {
      expect(readsLikeTheRepository(good), good).toBe(false)
    }
  })
})

// ─── …and the real changelog obeys them ──────────────────────────────────────

describe('RELEASES', () => {
  it('uses well-formed versions, and each one only once', () => {
    for (const release of RELEASES) {
      expect(isWellFormedVersion(release.version), release.version).toBe(true)
    }
    const versions = RELEASES.map((r) => r.version)
    // A repeated version silently means "already announced" and the second
    // release is never mailed — the receipt table is keyed on this string.
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('is ordered newest first', () => {
    expect(isNewestFirst(RELEASES.map((r) => r.version))).toBe(true)
  })

  it('carries a real calendar date', () => {
    for (const release of RELEASES) {
      expect(isRealCalendarDate(release.date), release.date).toBe(true)
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
    for (const item of everyLine(RELEASES)) {
      expect(isSentence(item), `not a sentence: "${item}"`).toBe(true)
    }
  })

  it('says nothing an administrator cannot see in the app', () => {
    for (const item of everyLine(RELEASES)) {
      expect(readsLikeTheRepository(item), `technical wording in "${item}"`).toBe(false)
    }
  })
})

function everyLine(releases: readonly ReleaseNote[]): string[] {
  return releases.flatMap((r) => [r.title, ...r.changes])
}
