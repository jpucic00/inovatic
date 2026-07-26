-- CreateEnum
CREATE TYPE "EmailCampaignKind" AS ENUM ('CUSTOM', 'REENROLLMENT');

-- CreateEnum
CREATE TYPE "EmailRecipientStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "kind" "EmailCampaignKind" NOT NULL,
    "sourceSchoolYear" TEXT NOT NULL,
    "sourceGroupIds" TEXT[],
    "targetSchoolYear" TEXT,
    "targetCourseId" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "status" "EmailRecipientStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailCampaign_city_createdAt_idx" ON "EmailCampaign"("city", "createdAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_city_kind_targetCourseId_targetSchoolYear_idx" ON "EmailCampaign"("city", "kind", "targetCourseId", "targetSchoolYear");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_campaignId_idx" ON "EmailCampaignRecipient"("campaignId");

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_targetCourseId_fkey" FOREIGN KEY ("targetCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
