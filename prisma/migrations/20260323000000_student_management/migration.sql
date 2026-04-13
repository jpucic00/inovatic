-- Step 1: Add username and plainPassword to User
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "plainPassword" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- Step 2: Add studentId to Inquiry
ALTER TABLE "Inquiry" ADD COLUMN "studentId" TEXT;
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: Remove CONFIRMED from InquiryStatus enum
-- First migrate any existing CONFIRMED rows
UPDATE "Inquiry" SET "status" = 'SCHEDULE_SENT' WHERE "status" = 'CONFIRMED';

-- Rename old enum, create new one without CONFIRMED, migrate column, drop old
ALTER TYPE "InquiryStatus" RENAME TO "InquiryStatus_old";
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'SCHEDULE_SENT', 'ACCOUNT_CREATED', 'DECLINED');
ALTER TABLE "Inquiry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Inquiry" ALTER COLUMN "status" TYPE "InquiryStatus" USING ("status"::text::"InquiryStatus");
ALTER TABLE "Inquiry" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "InquiryStatus_old";

-- Step 4: Create CommentType enum
CREATE TYPE "CommentType" AS ENUM ('COMMENT', 'MODULE_REVIEW');

-- Step 5: Create StudentComment table
CREATE TABLE "StudentComment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "CommentType" NOT NULL DEFAULT 'COMMENT',
    "moduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentComment_pkey" PRIMARY KEY ("id")
);

-- Step 6: Add foreign keys for StudentComment
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ScheduledGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
