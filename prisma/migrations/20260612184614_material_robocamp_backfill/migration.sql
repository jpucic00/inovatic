-- Backfill: legacy RoboCamp tutorials were stored as VIDEO + an elearning.robocamp.eu
-- externalUrl and detected at render time. They are now a first-class ROBOCAMP type.
-- Flip the existing rows. Trailing-slash / exact-match forms avoid matching look-alike
-- hosts such as elearning.robocamp.eu.evil.com.
UPDATE "Material"
SET "type" = 'ROBOCAMP'
WHERE "type" = 'VIDEO'
  AND "externalUrl" IS NOT NULL
  AND (
    "externalUrl" LIKE 'https://elearning.robocamp.eu/%'
    OR "externalUrl" LIKE 'http://elearning.robocamp.eu/%'
    OR "externalUrl" = 'https://elearning.robocamp.eu'
    OR "externalUrl" = 'http://elearning.robocamp.eu'
  );
