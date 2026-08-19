/**
 * The changelog, as data — the single source of truth for "what version is this
 * app and what changed in it".
 *
 * Written by the `/release` skill (`.claude/skills/release/SKILL.md`), never by
 * hand mid-feature. Adding an entry here IS declaring a release: on the next
 * deploy the announcer (`src/lib/release-announce.ts`) mails it to every admin,
 * exactly once. Pushing with nothing added here mails nobody, which is the
 * normal case — most pushes are invisible to the people using the app.
 *
 * ── How the notes must read ────────────────────────────────────────────────
 * Every line is addressed to an administrator who has never seen the code and
 * never will. It names something they can SEE or DO in the app, in Croatian, in
 * one sentence, in the vocabulary the app's own screens use ("upit", "grupa",
 * "polaznik", "preporuka") — not the vocabulary of the repository.
 *
 *   YES  "Kod upita sada odmah piše je li dijete već bilo polaznik."
 *   NO   "Dodan `returningMarker` u `resolveReturningMarker`."
 *
 *   YES  "Ocjene se šalju roditeljima po djetetu, pa dvoje braće dobiju dva maila."
 *   NO   "EVALUATION kampanja: jedan recipient = jedno dijete, ne inbox."
 *
 * No file names, no table or column names, no framework or library names, no
 * ids, no ticket numbers. A change nobody outside the repository can perceive —
 * a refactor, a test, a dependency bump — gets NO line at all. An empty
 * `added`/`changed`/`fixed` is a fine and honest outcome; a release with
 * nothing worth telling anyone is a release that should not have been cut.
 *
 * Correcting a typo in an entry that has already shipped is safe: this file is
 * only ever READ, and the receipt lives in `ReleaseAnnouncement`. Nobody is
 * mailed twice. But the corrected sentence is then not the one they received —
 * so fix it for the record, not to change the message.
 */

export interface ReleaseNote {
  /**
   * `MAJOR.MINOR.PATCH`. Also the `ReleaseAnnouncement` primary key that makes
   * the send once-only, and the git tag (`v` + this) on the release commit —
   * one string tying the three together, so `git show v1.2.0` answers "what
   * exactly did the admins get told about?".
   */
  version: string
  /** The day the release was cut, `yyyy-mm-dd`. Rendered `dd.MM.yyyy.` */
  date: string
  /**
   * One plain sentence naming the release as a whole — it becomes the e-mail's
   * subject line, so it has to make sense alone in an inbox list.
   */
  title: string
  /** Capabilities that did not exist before. */
  added?: string[]
  /** Things that existed and now behave differently or better. */
  changed?: string[]
  /** Things that were broken and now are not. */
  fixed?: string[]
}

/**
 * Newest FIRST — the order this file is read in, and the order a "Što je novo"
 * screen would want. The announcer reverses it, because when two releases are
 * somehow pending at once they must be mailed in the order they happened.
 */
export const RELEASES: readonly ReleaseNote[] = []

/**
 * The three groups in render order, with the empty ones dropped, so the e-mail
 * template never has to ask whether a heading has anything under it.
 *
 * Deliberately ordered novo → poboljšano → ispravljeno: an admin skimming on a
 * phone should meet the new thing first and the bug fixes last.
 */
export function releaseSections(
  release: ReleaseNote,
): { heading: string; items: readonly string[] }[] {
  return [
    { heading: 'Novo', items: release.added ?? [] },
    { heading: 'Poboljšano', items: release.changed ?? [] },
    { heading: 'Ispravljeno', items: release.fixed ?? [] },
  ].filter((section) => section.items.length > 0)
}
