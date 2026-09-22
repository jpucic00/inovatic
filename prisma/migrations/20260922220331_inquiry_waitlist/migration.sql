-- Lista čekanja za upite (2026-09-22). Purely additive: null waitlistedAt
-- means "not on the list", which is already true for every existing row, so
-- there is nothing to backfill.

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "waitlistNote" TEXT,
ADD COLUMN     "waitlistedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InquiryWaitlistGroup" (
    "inquiryId" TEXT NOT NULL,
    "scheduledGroupId" TEXT NOT NULL,

    CONSTRAINT "InquiryWaitlistGroup_pkey" PRIMARY KEY ("inquiryId","scheduledGroupId")
);

-- CreateIndex
CREATE INDEX "InquiryWaitlistGroup_scheduledGroupId_idx" ON "InquiryWaitlistGroup"("scheduledGroupId");

-- CreateIndex
CREATE INDEX "Inquiry_city_schoolYear_waitlistedAt_idx" ON "Inquiry"("city", "schoolYear", "waitlistedAt");

-- AddForeignKey
ALTER TABLE "InquiryWaitlistGroup" ADD CONSTRAINT "InquiryWaitlistGroup_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryWaitlistGroup" ADD CONSTRAINT "InquiryWaitlistGroup_scheduledGroupId_fkey" FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
