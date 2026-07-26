-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "sourceRecommendationKinds" "RecommendationKind"[] DEFAULT ARRAY[]::"RecommendationKind"[];
