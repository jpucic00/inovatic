-- CreateTable
CREATE TABLE "SchoolYear" (
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("label")
);

-- Backfill: register every school year already referenced by existing rows.
INSERT INTO "SchoolYear" ("label", "createdAt")
SELECT DISTINCT x.y, CURRENT_TIMESTAMP FROM (
    SELECT "schoolYear" AS y FROM "ScheduledGroup"
    UNION SELECT "schoolYear" FROM "ModuleSchedule"
    UNION SELECT "schoolYear" FROM "Enrollment"
) x
ON CONFLICT ("label") DO NOTHING;
