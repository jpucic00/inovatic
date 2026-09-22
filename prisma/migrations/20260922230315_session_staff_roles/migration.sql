-- CreateEnum
CREATE TYPE "TeacherRole" AS ENUM ('LEAD', 'ASSISTANT');

-- AlterTable
ALTER TABLE "TeacherAssignment" ADD COLUMN     "role" "TeacherRole" NOT NULL DEFAULT 'LEAD';

-- CreateTable
CREATE TABLE "SessionStaffChange" (
    "id" TEXT NOT NULL,
    "scheduledGroupId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeacherRole" NOT NULL,
    "replacesUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionStaffChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionStaffChange_userId_sessionDate_idx" ON "SessionStaffChange"("userId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "SessionStaffChange_scheduledGroupId_sessionDate_userId_key" ON "SessionStaffChange"("scheduledGroupId", "sessionDate", "userId");

-- AddForeignKey
ALTER TABLE "SessionStaffChange" ADD CONSTRAINT "SessionStaffChange_scheduledGroupId_fkey" FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStaffChange" ADD CONSTRAINT "SessionStaffChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStaffChange" ADD CONSTRAINT "SessionStaffChange_replacesUserId_fkey" FOREIGN KEY ("replacesUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStaffChange" ADD CONSTRAINT "SessionStaffChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
