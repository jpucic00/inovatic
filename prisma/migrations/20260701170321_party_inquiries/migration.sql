-- CreateEnum
CREATE TYPE "InquiryType" AS ENUM ('COURSE', 'PARTY');

-- AlterEnum
ALTER TYPE "InquiryStatus" ADD VALUE 'PARTY_SCHEDULED';

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "partyConfirmedDate" DATE,
ADD COLUMN     "partyProposedDate" DATE,
ADD COLUMN     "partyStartTime" TEXT,
ADD COLUMN     "type" "InquiryType" NOT NULL DEFAULT 'COURSE',
ALTER COLUMN "childFirstName" DROP NOT NULL,
ALTER COLUMN "childLastName" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Inquiry_type_status_idx" ON "Inquiry"("type", "status");
