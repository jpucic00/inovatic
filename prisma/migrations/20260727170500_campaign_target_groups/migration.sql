-- A resumed invitation must offer the same termini the first run did, and the
-- selected target groups were not being recorded anywhere.
ALTER TABLE "EmailCampaign"
  ADD COLUMN "targetGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
