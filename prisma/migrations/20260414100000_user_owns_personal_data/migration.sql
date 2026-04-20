-- Add parent/child metadata + GDPR consent columns to User
ALTER TABLE "User" ADD COLUMN "parentName" TEXT;
ALTER TABLE "User" ADD COLUMN "parentEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "parentPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "childSchool" TEXT;
ALTER TABLE "User" ADD COLUMN "gdprConsentAt" TIMESTAMP(3);

-- Backfill from already-linked ACCOUNT_CREATED inquiries.
-- COALESCE keeps it idempotent if re-run against a partially-migrated DB.
-- Uses DISTINCT ON to take the most recent linked inquiry per user, matching
-- the pattern established in 20260401000001_user_date_of_birth.
UPDATE "User" u
SET "parentName"    = COALESCE(u."parentName",    sub."parentName"),
    "parentEmail"   = COALESCE(u."parentEmail",   sub."parentEmail"),
    "parentPhone"   = COALESCE(u."parentPhone",   sub."parentPhone"),
    "childSchool"   = COALESCE(u."childSchool",   sub."childSchool"),
    "gdprConsentAt" = COALESCE(u."gdprConsentAt", sub."consentGivenAt")
FROM (
  SELECT DISTINCT ON (i."studentId")
    i."studentId",
    i."parentName",
    i."parentEmail",
    i."parentPhone",
    i."childSchool",
    i."consentGivenAt"
  FROM "Inquiry" i
  WHERE i."studentId" IS NOT NULL
    AND i.status = 'ACCOUNT_CREATED'
  ORDER BY i."studentId", i."createdAt" DESC
) sub
WHERE u.id = sub."studentId";
