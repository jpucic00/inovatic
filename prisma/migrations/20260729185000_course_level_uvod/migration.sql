-- Uvod u Svijet LEGO robotike: predškolci get their own program instead of
-- sharing SLR 1. Additive only — no existing Course row changes level, and no
-- enrollment moves. The new course row itself, and the age correction on
-- SLR 1 (6–8 → 7–8) and SLR 4, are content: they come from courses-data.ts via
-- `npm run db:seed:programs`, which is idempotent and safe against production.
--
-- Placed BEFORE 'SLR_1' so the enum's declared order matches the ladder.

-- AlterEnum
ALTER TYPE "CourseLevel" ADD VALUE 'UVOD' BEFORE 'SLR_1';
