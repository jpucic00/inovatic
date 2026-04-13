-- Migrate existing SCHEDULE_SENT inquiries back to NEW
UPDATE "Inquiry" SET "status" = 'NEW' WHERE "status" = 'SCHEDULE_SENT';

-- Remove SCHEDULE_SENT from the InquiryStatus enum
CREATE TYPE "InquiryStatus_new" AS ENUM ('NEW', 'ACCOUNT_CREATED', 'DECLINED');
ALTER TABLE "Inquiry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Inquiry" ALTER COLUMN "status" TYPE "InquiryStatus_new" USING ("status"::text::"InquiryStatus_new");
ALTER TABLE "Inquiry" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "InquiryStatus";
ALTER TYPE "InquiryStatus_new" RENAME TO "InquiryStatus";
