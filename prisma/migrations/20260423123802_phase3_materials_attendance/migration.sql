-- Phase 3 schema refactor:
--   * Material gets scope (MODULE | COURSE | GROUP) with optional FKs per variant.
--   * Drop Material.isPublished (attached = visible).
--   * Add externalUrl for embedded YouTube/Vimeo on VIDEO materials.
--   * Add MaterialGroupHide so teachers can hide an inherited MODULE/COURSE
--     material from a specific ScheduledGroup.
--   * Add Attendance for weekly presence tracking.
-- Live-safe ordering: add nullable columns, backfill existing rows, then set
-- NOT NULL. Existing Material rows become scope=GROUP — zero visible change.

-- ── MaterialScope enum ───────────────────────────────────────────────────────
CREATE TYPE "MaterialScope" AS ENUM ('MODULE', 'COURSE', 'GROUP');

-- ── Material refactor ────────────────────────────────────────────────────────
-- Relax FK on scheduledGroupId so non-GROUP materials can null it out.
ALTER TABLE "Material" DROP CONSTRAINT "Material_scheduledGroupId_fkey";

-- Add new columns. scope is nullable until backfill runs.
ALTER TABLE "Material" DROP COLUMN "isPublished";
ALTER TABLE "Material" ADD COLUMN "courseId" TEXT;
ALTER TABLE "Material" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "Material" ADD COLUMN "scope" "MaterialScope";
ALTER TABLE "Material" ALTER COLUMN "scheduledGroupId" DROP NOT NULL;

-- Backfill: every existing Material row is tied to a scheduledGroup, so GROUP
-- is the right classification. Keeps all current materials visible exactly
-- where they already were.
UPDATE "Material" SET "scope" = 'GROUP' WHERE "scope" IS NULL;

-- Now enforce NOT NULL.
ALTER TABLE "Material" ALTER COLUMN "scope" SET NOT NULL;

-- Scope invariant: exactly the right FK must be present for each scope.
-- Belt-and-braces: the Zod validators enforce this too, but a DB-level check
-- prevents drift from direct SQL edits or forgotten migrations.
ALTER TABLE "Material" ADD CONSTRAINT "Material_scope_fk_check"
  CHECK (
    ("scope" = 'MODULE' AND "moduleId"         IS NOT NULL) OR
    ("scope" = 'COURSE' AND "courseId"         IS NOT NULL) OR
    ("scope" = 'GROUP'  AND "scheduledGroupId" IS NOT NULL)
  );

-- Re-add FKs (scheduledGroupId now ON DELETE SET NULL because the row may
-- outlive its group when scope is MODULE/COURSE — although in practice MODULE
-- /COURSE rows never set scheduledGroupId).
ALTER TABLE "Material" ADD CONSTRAINT "Material_scheduledGroupId_fkey"
  FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Material" ADD CONSTRAINT "Material_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for the three effective-materials query variants.
CREATE INDEX "Material_scope_moduleId_idx"         ON "Material"("scope", "moduleId");
CREATE INDEX "Material_scope_courseId_idx"         ON "Material"("scope", "courseId");
CREATE INDEX "Material_scope_scheduledGroupId_idx" ON "Material"("scope", "scheduledGroupId");

-- ── MaterialGroupHide ────────────────────────────────────────────────────────
CREATE TABLE "MaterialGroupHide" (
    "id"               TEXT NOT NULL,
    "materialId"       TEXT NOT NULL,
    "scheduledGroupId" TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialGroupHide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialGroupHide_materialId_scheduledGroupId_key"
  ON "MaterialGroupHide"("materialId", "scheduledGroupId");

ALTER TABLE "MaterialGroupHide" ADD CONSTRAINT "MaterialGroupHide_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialGroupHide" ADD CONSTRAINT "MaterialGroupHide_scheduledGroupId_fkey"
  FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Attendance ───────────────────────────────────────────────────────────────
CREATE TABLE "Attendance" (
    "id"           TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sessionDate"  DATE NOT NULL,
    "present"      BOOLEAN NOT NULL,
    "note"         TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX        "Attendance_sessionDate_idx"               ON "Attendance"("sessionDate");
CREATE UNIQUE INDEX "Attendance_enrollmentId_sessionDate_key"  ON "Attendance"("enrollmentId", "sessionDate");

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ModuleSchedule.updatedAt cleanup ─────────────────────────────────────────
-- Prisma 6 no longer generates DEFAULT CURRENT_TIMESTAMP on @updatedAt columns;
-- the ORM always sets the value on insert. Drop the stale default to match.
ALTER TABLE "ModuleSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;
