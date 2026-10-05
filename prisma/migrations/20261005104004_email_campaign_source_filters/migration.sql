-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "sourceFilters" TEXT[] DEFAULT ARRAY[]::TEXT[];
