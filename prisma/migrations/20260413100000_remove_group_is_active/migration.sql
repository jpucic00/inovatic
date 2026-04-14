-- Remove isActive from ScheduledGroup, make schoolYear required.
-- Step 1: Backfill any NULL schoolYear values with '2025/2026'
UPDATE "ScheduledGroup" SET "schoolYear" = '2025/2026' WHERE "schoolYear" IS NULL;

-- Step 2: Make schoolYear NOT NULL
ALTER TABLE "ScheduledGroup" ALTER COLUMN "schoolYear" SET NOT NULL;

-- Step 3: Drop isActive column
ALTER TABLE "ScheduledGroup" DROP COLUMN "isActive";
