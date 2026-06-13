-- CreateTable
CREATE TABLE "CourseEnrollmentWindow" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "enrollmentStart" TIMESTAMP(3),
    "enrollmentEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEnrollmentWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseEnrollmentWindow_schoolYear_idx" ON "CourseEnrollmentWindow"("schoolYear");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollmentWindow_courseId_schoolYear_key" ON "CourseEnrollmentWindow"("courseId", "schoolYear");

-- AddForeignKey
ALTER TABLE "CourseEnrollmentWindow" ADD CONSTRAINT "CourseEnrollmentWindow_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one window per (course, school year) from existing group windows.
-- All groups of a program/year currently share the same window, so MIN/MAX
-- collapse to that shared value. Runs BEFORE the columns are dropped so no data
-- is lost. id is derived deterministically (one row per courseId+schoolYear) to
-- avoid depending on any uuid extension.
INSERT INTO "CourseEnrollmentWindow" ("id", "courseId", "schoolYear", "enrollmentStart", "enrollmentEnd", "createdAt", "updatedAt")
SELECT
    'cew_' || md5("courseId" || '::' || "schoolYear"),
    "courseId",
    "schoolYear",
    MIN("enrollmentStart"),
    MAX("enrollmentEnd"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ScheduledGroup"
WHERE "enrollmentStart" IS NOT NULL OR "enrollmentEnd" IS NOT NULL
GROUP BY "courseId", "schoolYear";

-- DropColumn (data preserved above)
ALTER TABLE "ScheduledGroup" DROP COLUMN "enrollmentEnd";
ALTER TABLE "ScheduledGroup" DROP COLUMN "enrollmentStart";
