-- Additive columns for the CREDENTIALS campaign kind. All nullable or defaulted,
-- so existing rows need no backfill and this is safe against a live database.
--
-- `User.credentialsSentAt` is deliberately NOT backfilled: deriving it from
-- account creation would stamp every send that FAILED as sent -- exactly the
-- families the campaign exists to reach -- and mis-date every returning child,
-- presenting a guess as an audit trail. NULL means "not sent by this system".

-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "sourceStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "EmailCampaignRecipient" ADD COLUMN     "studentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "credentialsSentAt" TIMESTAMP(3);
