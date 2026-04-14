-- CreateTable: ModuleSchedule
CREATE TABLE "ModuleSchedule" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleSchedule_pkey" PRIMARY KEY ("id")
);

-- Populate ModuleSchedule from existing CourseModule dates
INSERT INTO "ModuleSchedule" ("id", "moduleId", "schoolYear", "startDate", "endDate", "updatedAt")
SELECT gen_random_uuid(), "id", '2025/2026', "startDate", "endDate", NOW()
FROM "CourseModule";

-- Add moduleScheduleId column (nullable first for data migration)
ALTER TABLE "ModuleEnrollment" ADD COLUMN "moduleScheduleId" TEXT;

-- Populate moduleScheduleId from existing moduleId
UPDATE "ModuleEnrollment" me
SET "moduleScheduleId" = ms."id"
FROM "ModuleSchedule" ms
WHERE ms."moduleId" = me."moduleId" AND ms."schoolYear" = '2025/2026';

-- Make moduleScheduleId required
ALTER TABLE "ModuleEnrollment" ALTER COLUMN "moduleScheduleId" SET NOT NULL;

-- Drop old ModuleEnrollment constraints and column
ALTER TABLE "ModuleEnrollment" DROP CONSTRAINT "ModuleEnrollment_moduleId_fkey";
DROP INDEX "ModuleEnrollment_enrollmentId_moduleId_key";
ALTER TABLE "ModuleEnrollment" DROP COLUMN "moduleId";

-- Drop dates from CourseModule (now on ModuleSchedule)
ALTER TABLE "CourseModule" DROP COLUMN "startDate";
ALTER TABLE "CourseModule" DROP COLUMN "endDate";

-- Add new indexes and constraints
CREATE UNIQUE INDEX "ModuleSchedule_moduleId_schoolYear_key" ON "ModuleSchedule"("moduleId", "schoolYear");
CREATE UNIQUE INDEX "ModuleEnrollment_enrollmentId_moduleScheduleId_key" ON "ModuleEnrollment"("enrollmentId", "moduleScheduleId");

-- Add foreign keys
ALTER TABLE "ModuleSchedule" ADD CONSTRAINT "ModuleSchedule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleEnrollment" ADD CONSTRAINT "ModuleEnrollment_moduleScheduleId_fkey" FOREIGN KEY ("moduleScheduleId") REFERENCES "ModuleSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
