-- Third campaign kind: one report card per e-mail (see EmailCampaignKind docs).
ALTER TYPE "EmailCampaignKind" ADD VALUE 'EVALUATION';

-- The report card(s) a single recipient row is mailed. Additive with a default,
-- so existing CUSTOM/REENROLLMENT rows keep an empty array and no backfill is
-- needed — those kinds never carry per-recipient content.
ALTER TABLE "EmailCampaignRecipient"
  ADD COLUMN "assessmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
