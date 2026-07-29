-- CreateEnum
CREATE TYPE "ProgramKind" AS ENUM ('STANDARD', 'RADIONICA', 'COMPETITION');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "kind" "ProgramKind" NOT NULL DEFAULT 'STANDARD';

-- Backfill: every existing course is either a radionica or a standard SLR
-- program, and `isCustom` is what told them apart until now. Without this every
-- live radionica would come out of the migration labelled STANDARD.
UPDATE "Course" SET "kind" = 'RADIONICA' WHERE "isCustom" = true;

-- CreateTable
CREATE TABLE "CourseSeason" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentMonth" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseSeason_schoolYear_idx" ON "CourseSeason"("schoolYear");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSeason_courseId_schoolYear_city_key" ON "CourseSeason"("courseId", "schoolYear", "city");

-- CreateIndex
CREATE INDEX "EnrollmentMonth_periodStart_idx" ON "EnrollmentMonth"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentMonth_enrollmentId_periodStart_key" ON "EnrollmentMonth"("enrollmentId", "periodStart");

-- AddForeignKey
ALTER TABLE "CourseSeason" ADD CONSTRAINT "CourseSeason_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentMonth" ADD CONSTRAINT "EnrollmentMonth_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
