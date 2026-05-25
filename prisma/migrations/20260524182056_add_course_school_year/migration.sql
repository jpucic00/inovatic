-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "schoolYear" TEXT;

-- Backfill existing radionice (isCustom = true) with a school year derived
-- from their createdAt timestamp using the Sept-Aug academic bucket — same
-- rule as computeSchoolYear() in src/lib/school-year.ts.
UPDATE "Course"
SET "schoolYear" = CASE
  WHEN EXTRACT(MONTH FROM "createdAt") >= 9
    THEN EXTRACT(YEAR FROM "createdAt")::text || '/' || (EXTRACT(YEAR FROM "createdAt") + 1)::text
  ELSE (EXTRACT(YEAR FROM "createdAt") - 1)::text || '/' || EXTRACT(YEAR FROM "createdAt")::text
END
WHERE "isCustom" = TRUE
  AND "schoolYear" IS NULL;

-- Ensure every newly-stamped school year exists in the registry so the
-- admin switcher can navigate to it.
INSERT INTO "SchoolYear" ("label", "createdAt")
SELECT DISTINCT "schoolYear", NOW()
FROM "Course"
WHERE "isCustom" = TRUE AND "schoolYear" IS NOT NULL
ON CONFLICT ("label") DO NOTHING;
