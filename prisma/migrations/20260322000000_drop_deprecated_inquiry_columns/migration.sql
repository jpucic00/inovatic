-- Step 1: Migrate data from deprecated columns to new columns (for existing rows only)

-- Copy childName -> childFirstName + childLastName where new fields are empty
UPDATE "Inquiry"
SET
  "childFirstName" = split_part("childName", ' ', 1),
  "childLastName"  = CASE
    WHEN position(' ' IN "childName") > 0
    THEN substring("childName" FROM position(' ' IN "childName") + 1)
    ELSE ''
  END
WHERE "childName" IS NOT NULL
  AND "childFirstName" IS NULL;

-- Make childFirstName and childLastName required (non-nullable) now that all rows have data
ALTER TABLE "Inquiry" ALTER COLUMN "childFirstName" SET NOT NULL;
ALTER TABLE "Inquiry" ALTER COLUMN "childLastName" SET NOT NULL;

-- Step 2: Drop deprecated columns
ALTER TABLE "Inquiry" DROP COLUMN "childName";
ALTER TABLE "Inquiry" DROP COLUMN "childAge";
