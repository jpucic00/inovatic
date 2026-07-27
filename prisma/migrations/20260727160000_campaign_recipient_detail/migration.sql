-- Per-recipient campaign detail: the admin needs to see WHICH child was not
-- reached, not just how many. Also adds the two columns progress polling needs.

ALTER TYPE "EmailRecipientStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

ALTER TABLE "EmailCampaignRecipient"
  ADD COLUMN "childNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "failureReason" TEXT;

ALTER TABLE "EmailCampaign"
  ADD COLUMN "totalCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "finishedAt" TIMESTAMP(3);

-- Backfill history so existing campaigns render a sensible progress denominator
-- instead of 0, and never look "still sending".
UPDATE "EmailCampaign"
SET "totalCount" = "sentCount" + "failedCount",
    "finishedAt" = "createdAt";
