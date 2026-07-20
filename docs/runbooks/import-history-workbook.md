# Runbook: historical workbook import (Excel → DB)

Imports one school year's Excel workbook (evaluation sheet + one contact tab
per group) into the app: students, groups, enrollments, full-year paid marks,
teacher accounts/assignments, and report cards. Built for the 2025/2026 and
2024/2025 archives; **2024/2025 has a different layout and needs a parser
pass before use** — run 2025/2026 first.

```bash
npm run db:import-history -- <workbook.xlsx> [--year 2025/2026] [--apply]
```

**Dry-run by default** — without `--apply` nothing is written, ever. The
workbook file never leaves your machine; run it locally against whichever
`DATABASE_URL` you point it at.

## What the workbook must look like

- **Evaluation sheet** (any name; usually the first): stacked blocks of
  `PROGRAM:` / `GRUPA:` / `PREDAVAČ:` labels, a (possibly two-row merged)
  `BR|IME|PREZIME|<6 skills>|OPISNA OCJENA|PREPORUKA` header, student rows,
  blank row between blocks. Skill cells hold `Početno / U razvoju / Ostvareno`;
  `PREPORUKA` holds a course name (`SVIJET LEGO ROBOTIKE 2`, `SLR 2`) or
  `Priprema za natjecanja` / `Natjecateljski program`.
- **Contact tabs**, one per group, named `DAN_KURS_START-KRAJ`
  (`PON_SLR2_1830-20`, `ČET_SLR1_18:30-20:00` — both time spellings work):
  `NAZIV PROGRAMA:` / `TRENER:` labels, then a header row. Imported columns:
  `IME`, `PREZIME`, `RODITELJ`, `MAIL`, `MOBITEL`, `PLAĆENO`. Ignored by
  design: `GODINE`, `RAZRED`, `ISKUSTVO`, `OGLEDNA`, `UGOVOR`, `PLAĆANJE`,
  `POPUST`, `PONUDA`, `RAČUN`, `ASISTENT`.

Any other sheet is reported as ignored — nothing fails on extra sheets.

### Working from macOS Numbers

The importer reads `.xlsx` only — `.numbers` is not supported directly. In
Numbers use **File → Export To → Excel…** and import the exported file. Two
export quirks are handled automatically: checkbox cells become TRUE/FALSE
booleans, and sheets holding multiple tables may split into worksheets named
`PON_SLR2_1830-20 - Tablica 1` — the tab-name suffix is tolerated, and
evaluation blocks spread across several exported worksheets are merged.

## What it does

- **Groups** match existing rows for that year by parsed identity
  (course + day + start time), so `PON_SLR2_1830-20` finds
  `PON_SLR2_18:30-20:00`. Missing groups are created with the prod naming
  convention at the **Velebitska 32** venue, city SPLIT.
- **Teachers** match existing SPLIT staff by name (diacritic-insensitive).
  Unmatched names get real TEACHER accounts with a placeholder
  `@teacher.inovatic.local` email and an unusable password — fix the email
  later if the person becomes active again.
- **Students** are created with the app's credential convention
  (`username`, `<username>@student.inovatic.local`) but **no usable password**
  (`plainPassword` stays empty) — nobody can log in until an admin resets
  credentials. Existing same-name SPLIT students are matched, and empty
  parent fields are backfilled, never overwritten.
- **PLAĆENO = TRUE** → `Enrollment.fullYearPaidAt` (stamped at import time —
  it's a paid/unpaid flag, not a payment date).
- **Report cards** upsert per (student, group), authored by the block's
  PREDAVAČ (falling back to the tab's TRENER).
- **Idempotent**: re-running the same file only fills what's missing.

## Procedure

1. **Local dry-run** (uses `.env.local` → local Docker DB):

   ```bash
   npm run db:import-history -- ~/Downloads/evidencija-2025-2026.xlsx
   ```

   Read the whole report. `✖ ERROR` items are rows/blocks the import will
   *skip* (ambiguous groups, unresolvable names) — fix the workbook or accept
   the skip. `⚠ WARN` items import with a caveat. Check the group list: `=`
   means matched existing, `+` means will create.

2. **Local apply + eyeball** — add `--apply`, then browse
   `http://localhost:3000/admin/grupe` (year 2025/2026), a student page
   (parent contact, payments), and a report card. `npm run db:seed` later
   wipes this — it's only a rehearsal.

3. **Prod dry-run** (Neon pooled URL, inline — same habit as migrations):

   ```bash
   DATABASE_URL="postgresql://<neon-pooled-url>" \
   npm run db:import-history -- ~/Downloads/evidencija-2025-2026.xlsx
   ```

   The report now matches against real prod groups (`SRI_SLR1_18:30-20:00`…).
   Expect every prod 2025/2026 group to show `=`; investigate any unexpected
   `+` duplicates before applying.

4. **Prod apply** — same command plus `--apply`. Re-run is safe.

5. **Verify in prod admin**: group rosters, a paid column spot-check, one
   report card, and that the new teacher accounts look right
   (Admin → Nastavnici).

## Troubleshooting

- `No SPLIT location matching "Velebitska"` — create the venue first
  (Admin → Lokacije), then re-run.
- **Two groups share an identity / course+day ambiguity** — the report names
  them; merge or rename in the admin so the identity is unique, re-run.
- **A kid graded under two different parent emails** is treated as one child
  and flagged — if they're genuinely two kids, adjust one name in the
  workbook (e.g. add a middle initial) and re-run.
- Same-name collisions with **existing** students are matched, not duplicated;
  if that match is wrong there is no automated fix — resolve manually before
  `--apply`.
