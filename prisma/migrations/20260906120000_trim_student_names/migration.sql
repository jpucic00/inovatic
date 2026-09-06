-- Persisted student names are trimmed, NFC and single-spaced, and the parent
-- e-mail is trimmed (owner decision 2026-09-06, after a trailing space in an
-- upit produced a duplicate account). Account creation and edit now write that
-- form; this brings the rows that already exist onto the same footing. Data
-- only — no schema change. Idempotent: rows already in that form are untouched.
UPDATE "User"
SET "firstName" = btrim(regexp_replace(normalize("firstName", NFC), '\s+', ' ', 'g'))
WHERE "role" = 'STUDENT'
  AND "firstName" <> btrim(regexp_replace(normalize("firstName", NFC), '\s+', ' ', 'g'));

UPDATE "User"
SET "lastName" = btrim(regexp_replace(normalize("lastName", NFC), '\s+', ' ', 'g'))
WHERE "role" = 'STUDENT'
  AND "lastName" <> btrim(regexp_replace(normalize("lastName", NFC), '\s+', ' ', 'g'));

UPDATE "User"
SET "parentEmail" = btrim("parentEmail")
WHERE "role" = 'STUDENT'
  AND "parentEmail" IS NOT NULL
  AND "parentEmail" <> btrim("parentEmail");
