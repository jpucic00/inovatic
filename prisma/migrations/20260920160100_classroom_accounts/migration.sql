-- Račun za učionicu: one permanent shared login per city (2026-09-20).
--
-- Teachers type this account on every classroom PC so the children reach the
-- group's materials without their own passwords. It is created HERE, once, and
-- never through the app — there is deliberately no admin action to create,
-- rotate or delete it. The password is generated in SQL, so it differs per
-- environment and is never in git; teachers read it on /nastavnik.
--
-- pgcrypto: `crypt(pw, gen_salt('bf', 12))` emits a `$2a$` bcrypt hash that
-- bcryptjs.compare verifies (asserted by tests/integration/classroom-account).
-- IF NOT EXISTS for the same reason as unaccent: a restored backup that already
-- carries the extension must not fail the deploy.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ON CONFLICT (username): a re-run (restored backup, a dev DB reset that kept
-- the row) must never produce a second account for a city.
INSERT INTO "User" ("id", "email", "passwordHash", "plainPassword", "firstName", "lastName", "role", "city", "username", "createdAt", "updatedAt")
SELECT
  'cls' || encode(gen_random_bytes(11), 'hex'),
  username || '@classroom.inovatic.local',
  crypt(pw, gen_salt('bf', 12)),
  pw,
  'Učionica',
  label,
  'CLASSROOM'::"UserRole",
  city::"City",
  username,
  NOW(),
  NOW()
FROM (
  SELECT
    v.username,
    v.label,
    v.city,
    -- Six lowercase letters + digits, same shape as a student password.
    (
      SELECT string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789', 1 + floor(random() * 32)::int, 1), '')
      FROM generate_series(1, 6) AS s(i)
      WHERE v.username IS NOT NULL
    ) AS pw
  FROM (VALUES
    ('ucionica-split',   'Split',   'SPLIT'),
    ('ucionica-sibenik', 'Šibenik', 'SIBENIK')
  ) AS v(username, label, city)
) AS rows
ON CONFLICT ("username") DO NOTHING;
