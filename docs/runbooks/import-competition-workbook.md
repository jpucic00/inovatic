# Runbook: natjecateljski-program workbook import (Excel → DB)

Imports one school year's competition archive (izvješće sheet + one tab per
group) into the app: students, groups, mentor/assistant accounts and
assignments, enrollments with their monthly fees, and report cards on the
competition rubric.

```bash
npm run db:import-competition -- <workbook.xlsx> --year 2025/2026 [--city SPLIT] [--apply]
```

**Dry-run by default** — without `--apply` nothing is written, ever. The
workbook never leaves your machine; the import runs locally against whichever
`DATABASE_URL` you point it at.

**`--year` is mandatory** and must match the workbook: a wrong year silently
matches the *other* year's groups (same weekdays and times), which on apply
would attach enrollments and report cards to the wrong school year. As a safety
net the script refuses to run when the filename contains a contradicting year.

This is the sibling of `db:import-history` (the SLR archive). Same shape —
dry-run → read the report → apply → verify — but a different workbook layout,
so the two have separate parsers. Shared primitives live in
`src/lib/import-common/`.

## What the workbook must look like

- **Izvješće sheet** (any name; usually `IZVJEŠĆE 202526`): stacked per-group
  blocks. Each block starts with `NATJECATELJSKI PROGRAM: <WEEKDAY>` — on this
  sheet the label's value is the **group**, spelled as a weekday
  (`PONEDJELJAK`). Optional `MENTOR 1:` / `MENTOR 2:` / `ASISTENT:` /
  `PREDAVAČ:` rows follow, then a (possibly two-row merged) header
  `BR|IME|PREZIME|RAZRADA IDEJA|IZVEDIVOST|INOVACIJE|SURADNJA|KOMUNIKACIJA|ZABAVA|OPISNA OCJENA|PREPORUKA`,
  then student rows, then a blank row. The SLR spelling (`PROGRAM:` +
  `GRUPA:`) is accepted too.
- **Group tabs**, one per group, named `DAN HHMM-HHMM` — `SUB 900-1030`,
  `PON_1700-1830`, `ČET 18:30-20:00` all work. **The weekday in the tab name is
  the only link between a group tab and its izvješće block.**
- Each group tab carries, anywhere on the sheet (above *or* below the roster —
  both are used in the real archive):
  `NATJECATELJSKI PROGRAM: <team>` → the group's **name** (`PRIPREME ZA
  NATJECANJA`), plus `MENTOR 1:` / `MENTOR 2:` / `ASISTENT:`.
- Group-tab columns read: `IME`, `PREZIME`, `DATUM ROD.` (`DATUM ROĐENJA` and
  a few other spellings too), `RODITELJ`, `MAIL`, `MOBITEL`. Deliberately
  ignored: `BR.`, `RAZRED`, `ISKUSTVO`, `PLAĆANJE`, and **the per-month
  `9. MJ.` … `6. MJ.` amount columns** — an archived year is imported fully
  settled (owner decision), so those amounts are not read.
- Trailing punctuation on captions doesn't matter (`IME`, `IME:`, `BR.` all
  work), and unfilled label rows are safe: `MENTOR 2:` with nothing after it is
  read as empty even though its merged cells repeat the caption back.
- A staff cell may name **two people** (`Ime Prezime / Ime Prezime`) and may
  carry a parenthetical note (`Ime Prezime (12.03.2026.)`) — the pair is split,
  the note dropped.
- **Unfilled roster slots may sit anywhere in the table**; numbered rows with no
  name are skipped and the rows below them still import.

Any other sheet is reported as ignored — nothing fails on extra sheets.

### `--inspect`: debugging without sharing the file

The archive holds children's names, dates of birth and parents' contact
details, so it cannot be shared. When a sheet does not parse, run:

```bash
npm run db:import-competition -- <workbook.xlsx> --inspect
```

It touches no database and prints **no cell values** — only sheet names, how
each sheet was classified, which rows look like `LABEL:` lines, the header
captions verbatim (captions are vocabulary, not data), and the *shape* of each
column's values: `9{2}.9{2}.9{4}.` for `12.03.2014.`, `A{6}@A{7}.A{3}` for an
address. That output is safe to paste into a chat or an issue.

## What it does

- **Groups** match an existing competition group for that year and city by
  **weekday + start time**, comparing the stored `dayOfWeek`/`startTime`
  columns (not the group's name — competition groups are named freely, e.g.
  `WRO – srijedom`). A matched group **keeps its stored name**. A group that
  does not exist is created at the **Velebitska 32** venue, named after the
  team on its own tab; with no team label it falls back to
  `Natjecateljski program – <danom>`. When **two tabs claim the same team**
  (three groups all called `FLL`), each gets its weekday appended
  (`FLL – ponedjeljkom`) so they can be told apart in the admin; a team used
  once keeps its name exactly as written.
- **Mentors and assistants** all become `TeacherAssignment` rows. Existing
  staff are matched by name (diacritic-insensitive); unmatched names get real
  TEACHER accounts with a placeholder `@teacher.inovatic.local` email and an
  unusable password.
- **Report cards** are authored by the block's own mentor, falling back to the
  tab's mentor 1 → mentor 2 → asistent. Only the **competition rubric** columns
  are written (`razradaIdeja`, `izvedivost`, `inovacije` + the three team
  skills); `slaganje`/`programiranje` are explicitly nulled.
- **PREPORUKA** accepts the SLR courses, `Priprema za natjecanja`, the
  program-level track written bare or as a sentence (`PRIJELAZ NA
  NATJECATELJSKI PROGRAM`), and the per-team `FLL` / `WRO`.
- The free-text column is `POVRATNA INFORMACIJA` on this sheet (`OPISNA OCJENA`
  on the SLR one); both land in the report card's opisna ocjena.
- **Dates of birth** are stored as `YYYY-MM-DD`. `12.3.2014.`, `2014-03-12`,
  `12/03/2014`, real date cells and Excel serials all parse. A date outside
  **3–25 years of age** at the start of the school year (the archive holds a few
  1900s) or an impossible one (31.06.) is **dropped with a warning — the child
  still imports**, without a DOB.
- **Parent contact** is read from `RODITELJ` *and* `MAIL`, either of which may
  hold an Outlook paste (`Marija Perić <marija@outlook.com>`): the address wins
  from MAIL, the display name from RODITELJ, `"Perić, Marija"` is flipped to
  `Marija Perić`, `mailto:` is stripped and the address is lowercased — the
  stored value must equal what a parent later types into the inquiry form, or
  returning-student matching breaks.
- **Students** match existing same-city students **by name**, deliberately
  rather than by the app's strict name+DOB rule: these children overwhelmingly
  already exist as DOB-less accounts from the SLR import, and a duplicate
  account is worse than a missed DOB. A stored DOB that disagrees with the
  workbook is reported and the stored one is kept. Empty parent fields and an
  empty DOB are backfilled, never overwritten. New students get the app's
  credential convention but **no usable password** — an admin unlocks the
  account via "Generiraj lozinku" on `/admin/ucenici/[id]`.
- **Monthly fees**: the program is monthly-billed, and an archived year has
  already been paid for, so every month of the `CourseSeason` is written as an
  `EnrollmentMonth` **already marked paid**. Months a previous run left owed
  are settled too. **Set the season first** (`/admin/programi/<courseId>`) —
  without it the report says so and the enrollments get no payable months.
- **Idempotent**: re-running the same file only fills what's missing.

## Procedure

1. **Set the season** for the year you're importing on
   `/admin/programi/<natjecateljski-program>` — the import reads it to decide
   which months to write. Verify the end date is a real date (June has 30 days).

2. **Local dry-run** (uses `.env.local` → local Docker DB):

   ```bash
   npm run db:import-competition -- ~/Downloads/natjecateljski-2025-2026.xlsx --year 2025/2026
   ```

   Read the whole report. `✖ ERROR` items are rows/blocks the import will
   *skip*; `⚠ WARN` items import with a caveat. Check the group list: `=` means
   matched existing, `+` means will create. Check the two counters under
   Students — how many children got a date of birth and a parent e-mail.

   If the group count is 0, the tab names aren't being recognized: run
   `--inspect` and compare.

3. **Local apply + eyeball** — add `--apply`, then browse
   `/admin/grupe` (year 2025/2026), a student page (parent contact, the paid
   months), and a report card. `npm run db:seed` later wipes this — it's a
   rehearsal.

4. **Prod dry-run** — the import always executes on your machine:

   ```bash
   railway run npm run db:import-competition -- ~/Downloads/natjecateljski-2025-2026.xlsx --year 2025/2026
   ```

   or with the Neon pooled URL inline:

   ```bash
   DATABASE_URL="postgresql://<neon-pooled-url>" npm run db:import-competition -- ~/Downloads/natjecateljski-2025-2026.xlsx --year 2025/2026
   ```

   **Fingerprint the target before applying**: the report prints how many
   competition groups already exist for that year and the season dates it
   found. "0 existing groups" plus a missing season means you're pointed at the
   wrong database.

5. **Prod apply** — same command plus `--apply`. Re-run is safe.

6. **Verify in prod admin**: group rosters, a student's Plaćanje section (all
   months paid), one report card (competition rubric, correct mentor as
   author), and the new staff accounts under Nastavnici.

## Troubleshooting

- **`Course "natjecateljski-program" is not in this database`** — run
  `npm run db:seed:competition` first.
- **`No SPLIT location matching "Velebitska"`** — create the venue (Admin →
  Lokacije), then re-run.
- **"No sheet was recognized as a group tab"** — the tab names don't match
  `DAN HHMM-HHMM`. Run `--inspect` to see how each sheet was read; rename the
  tabs or send the inspect output.
- **"N groups run on \<weekday\> — block skipped"** — two competition groups
  share a weekday, so the izvješće block (which only names the weekday) cannot
  be attributed. Merge the groups, or split that block per group in the
  workbook, and re-run.
- **"already exists with date of birth X, the workbook says Y"** — one child or
  two? If two, disambiguate a name in the workbook and re-run; if one, fix
  whichever source is wrong.
- **Months show as unpaid afterwards** — the season was set *after* the import
  wrote the enrollments. Re-run the import; it fills the missing months and
  settles anything owed.
