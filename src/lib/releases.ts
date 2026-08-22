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
 * Every line is addressed to an administrator or a teacher who has never seen
 * the code and never will. It is written in the vocabulary the app's own
 * screens use ("upit", "grupa", "polaznik", "preporuka") — not the vocabulary
 * of the repository.
 *
 * 1. THE NOTES ARE GROUPED BY WHERE THE CHANGES LIVE. A release touches
 *    several parts of the app, and a reader wants the part they work in — a
 *    teacher scans for Dolazak, whoever handles enrolment scans for Upiti.
 *    `area` names that place the way the NAVIGATION names it (Kalendar, Upiti,
 *    Grupe, Programi, Učenici, Nastavnici, Lokacije, Novosti, E-mail, Dolazak,
 *    polaznički portal, prijavnica) — not the way the route is spelled. Two
 *    places that only ever change together may share one section
 *    ("Kalendar i Dolazak"); a change with no screen at all (a mail that
 *    arrives, a rule that spans everything) gets a section that says so.
 *
 * 2. THE SECTION SAYS WHERE, SO THE BULLET SAYS WHAT. Under `Profil učenika`
 *    the sentence does not open by repeating the place — it starts with the
 *    change. That is the whole payoff of grouping, and it is why the same fact
 *    is never restated in two sections.
 *
 *      YES  area: 'Profil učenika'
 *           "Uz oznake plaćanja, za svaku upisanu grupu možete označiti da je
 *            ugovor potpisan."
 *      NO   area: 'Profil učenika'
 *           "Na profilu djeteta možete označiti da je ugovor potpisan."
 *      NO   area: 'Razno'
 *           "Dodana je oznaka potpisanog ugovora po upisu."
 *
 * 3. NEVER SPLIT ONE FEATURE ACROSS SEVERAL LINES by whether the piece is new
 *    or merely different. The reader meets it as one thing in one place, so it
 *    is one sentence — the old capability and the way it now behaves belong in
 *    the same breath. Sections group by PLACE and never by novo / poboljšano /
 *    ispravljeno: that taxonomy tears a single feature in two the moment it
 *    both adds and changes something, which is most of them.
 *
 *      YES  "Pristupni podaci se više ne šalju kod kreiranja računa, nego
 *            porukom Pristupni podaci na E-mailu."
 *      NO   two lines, one announcing the new message and one announcing that
 *           account creation stopped sending.
 *
 * 4. NO REPOSITORY VOCABULARY, IN THE SECTION NAMES AS WELL AS THE LINES. No
 *    file names, no table or column names, no framework or library names, no
 *    ids, no ticket numbers.
 *
 *      YES  "Kod upita sada odmah piše je li dijete već bilo polaznik."
 *      NO   "Dodan returningMarker u resolveReturningMarker."
 *
 * 5. A CHANGE NOBODY OUTSIDE THE REPOSITORY CAN PERCEIVE GETS NO LINE. That
 *    covers refactors, tests and dependency bumps — and also every fix to a
 *    feature shipping in this same release, because no admin ever had the
 *    broken version. Fixes earn a line only when the broken thing was live.
 *
 * Sections are ordered as the reader should meet them, most consequential
 * first, and so are the lines inside each one.
 *
 * Correcting a typo in an entry that has already shipped is safe: this file is
 * only ever READ, and the receipt lives in `ReleaseAnnouncement`. Nobody is
 * mailed twice. But the corrected sentence is then not the one they received —
 * so fix it for the record, not to change the message.
 */

/**
 * One part of the app, and everything that changed in it this release.
 *
 * The grouping exists for the reader, not for the writer: staff use different
 * halves of this application, and a flat list makes each of them read past
 * everyone else's changes to find their own.
 */
export interface ReleaseSection {
  /**
   * Where these changes live, named the way the navigation names it. Short —
   * a label, not a sentence, because it is a heading in the e-mail.
   */
  area: string
  /**
   * What someone can see or do in that place that they could not before, one
   * sentence per feature. The section already said where, so the sentence
   * starts with the change. Never empty: a heading with nothing under it is a
   * section that should not have been written.
   */
  changes: string[]
}

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
   * The changes, grouped by where they live. Ordered as the reader should meet
   * them — most consequential first, since a phone shows very little before
   * the fold. Never empty: a release with nothing to tell anyone is a release
   * that should not have been cut.
   */
  sections: ReleaseSection[]
}

/**
 * Newest FIRST — the order this file is read in, and the order a "Što je novo"
 * screen would want. The announcer reverses it, because when two releases are
 * somehow pending at once they must be mailed in the order they happened.
 */
export const RELEASES: readonly ReleaseNote[] = [
  {
    version: '1.1.0',
    date: '2026-08-22',
    title:
      'Upis dobiva način plaćanja, potpisan ugovor i vlastitu poruku s pristupnim podacima',
    sections: [
      {
        area: 'Cijela aplikacija',
        changes: [
          'Od sada svi administratori dobivaju ovakvu poruku s promjenama u aplikaciji kad izađe nova verzija.',
        ],
      },
      {
        area: 'Pristupni podaci',
        changes: [
          'Pristupni podaci se više ne šalju kod kreiranja računa — do slanja ostaju čitljivi na profilu učenika.',
          'Šaljete ih porukom Pristupni podaci na E-mailu, kad su ugovori potpisani.',
        ],
      },
      {
        area: 'Profil učenika',
        changes: [
          'Uz oznake plaćanja, po svakom upisu administrator i nastavnik mogu označiti da je ugovor potpisan — nastavnik za svoje grupe tekuće školske godine.',
          'Kartica upisa pokazuje način plaćanja koji je roditelj odabrao na prijavnici, a administrator ga ovdje može promijeniti padajućim izbornikom.',
          'Kartica SLR upisa javlja popust za brata ili sestru kad obitelj kod nas ima još jedno dijete, imenuje ga i vodi na njegov profil.',
        ],
      },
      {
        area: 'Prijavnica i Upiti',
        changes: [
          'Roditelj na prijavnici bira način plaćanja za SLR program, po modulu ili za cijelu školsku godinu; radionice i natjecateljski program to pitanje ne postavljaju.',
          'Ponovne upise — djecu koja kod nas već imaju račun — sada možete izdvojiti filterom.',
          'Obavijest o novom upitu koja stiže u gradski e-mail inbox nosi oznaku Ponovni upis i odabrani način plaćanja.',
        ],
      },
      {
        area: 'Učenici',
        changes: [
          'Novi stupac kaže je li dijete u odabranoj školskoj godini ponovni upis, i po njemu se filtrira.',
        ],
      },
      {
        area: 'Kalendar i Dolazak',
        changes: [
          'Na Kalendaru se po gradu i školskoj godini postavlja probni tjedan.',
          'Svaka standardna grupa tada ima probni sat u svom danu i terminu — dodatan termin prije prvog modula, djetetu besplatan, a nastavniku plaćen kao redovan sat.',
        ],
      },
      {
        area: 'Polaznički portal',
        changes: [
          'Lozinka djeteta radi dok je upisano u tekuću ili sljedeću školsku godinu; prijava bez upisa javlja upravo taj razlog umjesto pogrešne lozinke.',
        ],
      },
      {
        area: 'Lokacije',
        changes: [
          'Postojeću lokaciju je sada moguće urediti, ne samo dodati i obrisati.',
        ],
      },
      {
        area: 'Javne stranice i poruke obiteljima',
        changes: [
          'Šibenske obitelji primaju sve poruke sa šibenske prijavne adrese i na nju odgovaraju, umjesto sa splitske.',
          'Kontaktna stranica grada vodi na društvene mreže tog ureda, a podnožje nabraja oba para uz ime grada.',
        ],
      },
    ],
  },
]
