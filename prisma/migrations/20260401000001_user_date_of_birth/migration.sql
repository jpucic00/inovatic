-- Add dateOfBirth to User (nullable for admins/teachers)
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TEXT;

-- Backfill: copy DOB from most recent linked inquiry for existing students
UPDATE "User" u
SET "dateOfBirth" = sub."childDateOfBirth"
FROM (
  SELECT DISTINCT ON (i."studentId") i."studentId", i."childDateOfBirth"
  FROM "Inquiry" i
  WHERE i."studentId" IS NOT NULL
    AND i."childDateOfBirth" IS NOT NULL
  ORDER BY i."studentId", i."createdAt" DESC
) sub
WHERE u.id = sub."studentId"
  AND u."dateOfBirth" IS NULL;
