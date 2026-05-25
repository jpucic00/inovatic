-- Replace single `date` field on ScheduledGroup with a closed [dateStart, dateEnd] range.
-- Radionice (Course.isCustom = true) previously stored a single day; this migration
-- backfills the new columns from the old one so existing single-day workshops remain
-- valid (dateStart = dateEnd = previous `date`). Standard programs had `date = NULL`
-- and continue to use `dayOfWeek`.

ALTER TABLE "ScheduledGroup"
  ADD COLUMN "dateStart" TEXT,
  ADD COLUMN "dateEnd"   TEXT;

UPDATE "ScheduledGroup"
SET "dateStart" = "date",
    "dateEnd"   = "date"
WHERE "date" IS NOT NULL;

ALTER TABLE "ScheduledGroup" DROP COLUMN "date";
