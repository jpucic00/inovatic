-- Corrective companion to 20260525115023_module_schedule_dates_to_date.
--
-- That migration cast `timestamp` → `date` with the wrong AT TIME ZONE
-- direction (it interpreted the stored UTC value as Europe/Zagreb local
-- time, then took the date in the UTC session), uniformly shifting every
-- row back by one calendar day. Both source variants of the stored
-- timestamp (UTC midnight and Zagreb-local midnight = UTC 22:00/23:00 of
-- the previous day) represented the SAME intended calendar day, so a
-- uniform `+ 1 day` restores the admin's original input.
--
-- Idempotent only within a single deploy: applied via prisma migrate, runs
-- exactly once. Safe in production — the bad migration ships in the same
-- deploy as this one, so production rows go through both in order.
UPDATE "ModuleSchedule"
SET
  "startDate" = "startDate" + 1,
  "endDate"   = "endDate"   + 1
WHERE "startDate" IS NOT NULL OR "endDate" IS NOT NULL;
