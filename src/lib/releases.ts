/**
 * The changelog, as data — the single source of truth for "what version is this
 * app and what changed in it".
 *
 * Written by the `/release` skill (`.claude/skills/release/SKILL.md`), never by
 * hand mid-feature. Adding an entry here IS declaring a release: on the next
 * production start the announcer (`src/lib/release-announce.ts`) mails it to
 * every admin, exactly once. Pushing with nothing added here mails nobody,
 * which is the normal case — most pushes are invisible to the people using the
 * app.
 *
 * ── How the notes must read ────────────────────────────────────────────────
 * Every line is addressed to an administrator who has never seen the code and
 * never will. It is one Croatian sentence, in the vocabulary the app's own
 * screens use ("upit", "grupa", "polaznik", "preporuka") — not the vocabulary
 * of the repository.
 *
 * 1. ONE LINE PER FEATURE, AND IT SAYS WHERE THE FEATURE LIVES. The reader's
 *    first question is "where do I find this?", so the sentence answers it
 *    before anything else — usually by opening with the place.
 *
 *      YES  "Na profilu djeteta, uz oznake plaćanja, za svaku upisanu grupu
 *            možete označiti da je ugovor potpisan."
 *      NO   "Dodana je oznaka potpisanog ugovora po upisu."
 *
 *    Name the place the way the navigation names it — Kalendar, Upiti, Grupe,
 *    Programi, Učenici, Nastavnici, Lokacije, Novosti, E-mail, Dolazak,
 *    polaznički portal, prijavnica. A line whose subject is a mail that
 *    arrives has no screen; then say what arrives and to whom.
 *
 * 2. NEVER SPLIT ONE FEATURE ACROSS SEVERAL LINES by whether the piece is new
 *    or merely different. The admin meets it as one thing in one place, so it
 *    is one sentence — the old capability and the way it now behaves belong in
 *    the same breath.
 *
 *      YES  "Pristupni podaci se ne šalju kod kreiranja računa, nego porukom
 *            Pristupni podaci na E-mailu, prije početka školske godine."
 *      NO   two lines, one announcing the new message and one announcing that
 *           account creation stopped sending.
 *
 * 3. NO REPOSITORY VOCABULARY. No file names, no table or column names, no
 *    framework or library names, no ids, no ticket numbers.
 *
 *      YES  "Kod upita sada odmah piše je li dijete već bilo polaznik."
 *      NO   "Dodan returningMarker u resolveReturningMarker."
 *
 * 4. A CHANGE NOBODY OUTSIDE THE REPOSITORY CAN PERCEIVE GETS NO LINE. That
 *    covers refactors, tests and dependency bumps — and also every fix to a
 *    feature shipping in this same release, because no admin ever had the
 *    broken version. Fixes earn a line only when the broken thing was live.
 *
 * The list is deliberately flat and ordered feature by feature, not grouped
 * into novo / poboljšano / ispravljeno. Those headings force one feature into
 * two places the moment it both adds and changes something, which is most of
 * them — and an admin skimming on a phone wants the app's own shape, not a
 * taxonomy of how the work was classified.
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
  /**
   * What an administrator can see or do that they could not before, one
   * sentence per feature, each naming where it lives. Ordered as the reader
   * should meet them — most consequential first, since a phone shows three
   * lines before the fold. Never empty: a release with nothing to tell anyone
   * is a release that should not have been cut.
   */
  changes: string[]
}

/**
 * Newest FIRST — the order this file is read in, and the order a "Što je novo"
 * screen would want. The announcer reverses it, because when two releases are
 * somehow pending at once they must be mailed in the order they happened.
 */
export const RELEASES: readonly ReleaseNote[] = []
