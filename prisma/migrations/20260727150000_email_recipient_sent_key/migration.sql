-- Makes the "one invitation per parent per program per year" rule a database
-- constraint instead of a read-then-write snapshot that two overlapping sends
-- could both pass.
--
-- `sentKey` is set ONLY on a SENT REENROLLMENT row. It stays NULL for CUSTOM
-- campaigns (deliberately repeatable) and for FAILED rows (so a retry may
-- invite that parent again). Postgres treats NULLs as distinct in a unique
-- index, so those rows never collide with one another.

ALTER TABLE "EmailCampaignRecipient" ADD COLUMN "sentKey" TEXT;

-- Backfill history so invitations already sent keep blocking a re-invite.
UPDATE "EmailCampaignRecipient" r
SET "sentKey" = c."city" || ':' || c."kind" || ':'
                || COALESCE(c."targetCourseId", '') || ':'
                || COALESCE(c."targetSchoolYear", '')
FROM "EmailCampaign" c
WHERE r."campaignId" = c."id"
  AND r."status" = 'SENT'
  AND c."kind" = 'REENROLLMENT';

-- The old code could already have double-invited a parent. Keep the earliest
-- row keyed and release the rest, otherwise creating the index would abort the
-- deploy on pre-existing data.
UPDATE "EmailCampaignRecipient" SET "sentKey" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "sentKey", "parentEmail" ORDER BY "sentAt", "id"
           ) AS rn
    FROM "EmailCampaignRecipient"
    WHERE "sentKey" IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX "EmailCampaignRecipient_sentKey_parentEmail_key"
  ON "EmailCampaignRecipient"("sentKey", "parentEmail");
