-- CreateEnum
CREATE TYPE "City" AS ENUM ('SPLIT', 'SIBENIK');

-- DropForeignKey
ALTER TABLE "ScheduledGroup" DROP CONSTRAINT "ScheduledGroup_locationId_fkey";

-- DropIndex
DROP INDEX "CourseEnrollmentWindow_courseId_schoolYear_key";

-- DropIndex
DROP INDEX "ModuleSchedule_moduleId_schoolYear_key";

-- DropIndex
DROP INDEX "SchoolYearHoliday_schoolYear_date_key";

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "city" "City";

-- Backfill: existing radionice (custom courses) are Split's. Standard SLR
-- programs stay city = NULL (shared catalog across cities).
UPDATE "Course" SET "city" = 'SPLIT' WHERE "isCustom" = true;

-- AlterTable
ALTER TABLE "CourseEnrollmentWindow" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "ModuleSchedule" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "ScheduledGroup" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "SchoolYearHoliday" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "city" "City" NOT NULL DEFAULT 'SPLIT';

-- CreateIndex
CREATE INDEX "Article_city_isPublished_idx" ON "Article"("city", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollmentWindow_courseId_schoolYear_city_key" ON "CourseEnrollmentWindow"("courseId", "schoolYear", "city");

-- CreateIndex
CREATE INDEX "Inquiry_city_schoolYear_status_idx" ON "Inquiry"("city", "schoolYear", "status");

-- CreateIndex
CREATE INDEX "Location_city_idx" ON "Location"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Location_id_city_key" ON "Location"("id", "city");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleSchedule_moduleId_schoolYear_city_key" ON "ModuleSchedule"("moduleId", "schoolYear", "city");

-- CreateIndex
CREATE INDEX "ScheduledGroup_city_schoolYear_idx" ON "ScheduledGroup"("city", "schoolYear");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYearHoliday_schoolYear_city_date_key" ON "SchoolYearHoliday"("schoolYear", "city", "date");

-- CreateIndex
CREATE INDEX "User_role_city_idx" ON "User"("role", "city");

-- AddForeignKey
ALTER TABLE "ScheduledGroup" ADD CONSTRAINT "ScheduledGroup_locationId_city_fkey" FOREIGN KEY ("locationId", "city") REFERENCES "Location"("id", "city") ON DELETE RESTRICT ON UPDATE CASCADE;

