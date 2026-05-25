-- Convert ModuleSchedule.startDate / endDate from `timestamp` to `date`.
--
-- Existing rows were created via two code paths:
--   * Admin form that sent UTC midnight (e.g. 2025-09-15 00:00:00+00)
--   * Admin form that sent Zagreb-local midnight which serialised to the
--     previous calendar day in UTC (e.g. 2025-09-14 22:00:00+00 = 2025-09-15
--     midnight CEST)
-- Both variants represent the SAME intended calendar date. The cast goes
-- through Europe/Zagreb so the second variant rounds back up to the day the
-- admin actually typed, instead of being silently truncated to the day-before.
ALTER TABLE "ModuleSchedule"
  ALTER COLUMN "startDate" SET DATA TYPE DATE
    USING ("startDate" AT TIME ZONE 'Europe/Zagreb')::date,
  ALTER COLUMN "endDate"   SET DATA TYPE DATE
    USING ("endDate" AT TIME ZONE 'Europe/Zagreb')::date;
