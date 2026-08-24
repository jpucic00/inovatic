-- Accent-insensitive admin list search (/admin/upiti, /admin/ucenici).
--
-- Postgres ILIKE folds case but not accents, so a staff member typing "Testic"
-- for a child stored as "Testić" got an empty table and read it as missing
-- data. `unaccent()` folds the whole Croatian set (č ć š ž đ, upper and lower)
-- so the search matches whichever way either side is spelled.
--
-- IF NOT EXISTS: the extension is a database-level object, so a restored
-- backup or a DB that already carries it must not fail the deploy.
CREATE EXTENSION IF NOT EXISTS unaccent;
