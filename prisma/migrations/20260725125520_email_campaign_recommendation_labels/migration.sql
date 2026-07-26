-- Replace the enum-kind audit column with display labels (per-course preporuka
-- filters need titles; column is empty everywhere — feature unshipped).
ALTER TABLE "EmailCampaign" DROP COLUMN "sourceRecommendationKinds";
ALTER TABLE "EmailCampaign" ADD COLUMN "sourceRecommendations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
