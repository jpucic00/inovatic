-- Drop Enrollment.status and ModuleEnrollment.status
-- Rationale: statuses on enrollment/module-enrollment are replaced by row presence.
-- CANCELLED rows are discarded (they represent nothing). COMPLETED rows stay as
-- historical participation — without a status column they just become "this student
-- was in this group/module" historization rows.

-- 1. Drop cancelled rows that are being represented only by their status.
DELETE FROM "ModuleEnrollment" WHERE "status" = 'CANCELLED';
DELETE FROM "Enrollment"       WHERE "status" = 'CANCELLED';

-- 2. Drop the status columns.
ALTER TABLE "ModuleEnrollment" DROP COLUMN "status";
ALTER TABLE "Enrollment"       DROP COLUMN "status";

-- 3. Drop the now-unused enum types.
DROP TYPE "ModuleEnrollmentStatus";
DROP TYPE "EnrollmentStatus";
