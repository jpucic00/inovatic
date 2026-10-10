-- Materijali v2 (Flux av4885t): lessons + audience.
--
-- Every material a child can see now sits in a lesson (program → module →
-- lesson → material). Lessons bind to termin NUMBERS inside a module, never to
-- dates. Two audiences: STUDENT (portal) and TEACHER (staff only).
--
-- Data: every existing material is kept and placed (owner decision 2026-10-10):
--   * MODULE materials → one lesson per module on 1. sat, named after the
--     module-1 project for the five standard programs ("1. Puž" …), otherwise
--     "1. lekcija".
--   * a standard program's "Probni sat" material (and any program-wide RoboCamp
--     guide) → a "Probni sat" lesson on slot 0 of the program's first module.
--   * the remaining program-wide (COURSE) documents stay COURSE as teacher-only
--     "whole program" material.
--   * radionice (no modules): COURSE + GROUP materials → a "1. lekcija" directly
--     under the program; GROUP rows stay group-only, now inside that lesson.
--   * GROUP materials of a program with modules → that program's first-module
--     lesson.
--   * RoboCamp guides → STUDENT, everything else → TEACHER (the owner moves the
--     good ones to the kids by hand). Nothing is deleted.

-- ─── Schema ──────────────────────────────────────────────────────────────────

-- The DEFAULT is temporary: it fills the existing rows and is dropped at the end,
-- so every later insert must name its audience.
ALTER TABLE "Material" ADD COLUMN "audience" "MaterialAudience" NOT NULL DEFAULT 'TEACHER',
ADD COLUMN "lessonId" TEXT;

CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonSession" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,

    CONSTRAINT "LessonSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lesson_courseId_idx" ON "Lesson"("courseId");
CREATE INDEX "Lesson_moduleId_idx" ON "Lesson"("moduleId");
CREATE UNIQUE INDEX "Lesson_id_moduleId_key" ON "Lesson"("id", "moduleId");
CREATE INDEX "LessonSession_lessonId_idx" ON "LessonSession"("lessonId");
CREATE UNIQUE INDEX "LessonSession_moduleId_sessionNumber_key" ON "LessonSession"("moduleId", "sessionNumber");
CREATE UNIQUE INDEX "CourseModule_id_courseId_key" ON "CourseModule"("id", "courseId");
CREATE INDEX "Material_lessonId_idx" ON "Material"("lessonId");

ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_courseId_fkey" FOREIGN KEY ("moduleId", "courseId") REFERENCES "CourseModule"("id", "courseId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_lessonId_moduleId_fkey" FOREIGN KEY ("lessonId", "moduleId") REFERENCES "Lesson"("id", "moduleId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 0 = probni sat, 1–7 = the module's sats (SESSIONS_PER_MODULE).
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_number_check"
  CHECK ("sessionNumber" BETWEEN 0 AND 7);

-- The old shape check only required the scope's own FK; the new one is replaced
-- after the data has been reshaped.
ALTER TABLE "Material" DROP CONSTRAINT "Material_scope_fk_check";

-- ─── Data ────────────────────────────────────────────────────────────────────

UPDATE "Material" SET "audience" = 'STUDENT' WHERE "type" = 'ROBOCAMP';

-- Each program's first module (by sortOrder).
CREATE TEMP TABLE "mv2_first_module" AS
SELECT DISTINCT ON (cm."courseId") cm."courseId", cm."id" AS "moduleId"
FROM "CourseModule" cm
ORDER BY cm."courseId", cm."sortOrder", cm."id";

-- Program-wide materials that go to the probni sat: a standard program with
-- modules, titled "Probni sat" or a RoboCamp guide.
CREATE TEMP TABLE "mv2_probni" AS
SELECT m."id" AS "materialId", m."courseId", fm."moduleId"
FROM "Material" m
JOIN "Course" c ON c."id" = m."courseId"
JOIN "mv2_first_module" fm ON fm."courseId" = c."id"
WHERE m."scope" = 'COURSE'
  AND c."kind" = 'STANDARD'
  AND (lower(btrim(m."title")) = 'probni sat' OR m."type" = 'ROBOCAMP');

-- Modules that need a "first lesson": every module with MODULE materials, plus
-- the first module of a program with modules that has group materials or
-- program-wide RoboCamp guides not taken by the probni sat (natjecanja).
CREATE TEMP TABLE "mv2_lesson_module" AS
SELECT DISTINCT cm."courseId", cm."id" AS "moduleId"
FROM "Material" m
JOIN "CourseModule" cm ON cm."id" = m."moduleId"
WHERE m."scope" = 'MODULE'
UNION
SELECT DISTINCT g."courseId", fm."moduleId"
FROM "Material" m
JOIN "ScheduledGroup" g ON g."id" = m."scheduledGroupId"
JOIN "mv2_first_module" fm ON fm."courseId" = g."courseId"
WHERE m."scope" = 'GROUP'
UNION
SELECT DISTINCT m."courseId", fm."moduleId"
FROM "Material" m
JOIN "mv2_first_module" fm ON fm."courseId" = m."courseId"
WHERE m."scope" = 'COURSE' AND m."type" = 'ROBOCAMP'
  AND m."id" NOT IN (SELECT "materialId" FROM "mv2_probni");

CREATE TEMP TABLE "mv2_module_lesson" AS
SELECT
  lm."courseId",
  lm."moduleId",
  'mv2l_' || replace(gen_random_uuid()::text, '-', '') AS "lessonId",
  CASE
    WHEN fm."moduleId" IS NOT NULL AND c."slug" = 'uvod-u-svijet-lego-robotike' THEN '1. Puž'
    WHEN fm."moduleId" IS NOT NULL AND c."slug" = 'slr-1' THEN '1. Vrtuljak'
    WHEN fm."moduleId" IS NOT NULL AND c."slug" = 'slr-2' THEN '1. Sova'
    WHEN fm."moduleId" IS NOT NULL AND c."slug" = 'slr-3' THEN '1. Spirograf'
    WHEN fm."moduleId" IS NOT NULL AND c."slug" = 'slr-4' THEN '1. Polagač mosta (mostonoša)'
    ELSE '1. lekcija'
  END AS "title",
  c."kind"
FROM "mv2_lesson_module" lm
JOIN "Course" c ON c."id" = lm."courseId"
LEFT JOIN "mv2_first_module" fm ON fm."moduleId" = lm."moduleId";

INSERT INTO "Lesson" ("id", "courseId", "moduleId", "title", "sortOrder", "updatedAt")
SELECT "lessonId", "courseId", "moduleId", "title", 1, CURRENT_TIMESTAMP
FROM "mv2_module_lesson";

-- Standard lessons hold 1. sat; a natjecanje lesson is undated.
INSERT INTO "LessonSession" ("id", "lessonId", "moduleId", "sessionNumber")
SELECT 'mv2s_' || replace(gen_random_uuid()::text, '-', ''), "lessonId", "moduleId", 1
FROM "mv2_module_lesson"
WHERE "kind" = 'STANDARD';

-- Probni sat lessons: one per standard program that has probni sat material.
CREATE TEMP TABLE "mv2_probni_lesson" AS
SELECT DISTINCT ON (p."courseId")
  p."courseId",
  p."moduleId",
  'mv2l_' || replace(gen_random_uuid()::text, '-', '') AS "lessonId"
FROM "mv2_probni" p
ORDER BY p."courseId";

INSERT INTO "Lesson" ("id", "courseId", "moduleId", "title", "sortOrder", "updatedAt")
SELECT "lessonId", "courseId", "moduleId", 'Probni sat', 0, CURRENT_TIMESTAMP
FROM "mv2_probni_lesson";

INSERT INTO "LessonSession" ("id", "lessonId", "moduleId", "sessionNumber")
SELECT 'mv2s_' || replace(gen_random_uuid()::text, '-', ''), "lessonId", "moduleId", 0
FROM "mv2_probni_lesson";

-- Programs WITHOUT modules (radionice): one "1. lekcija" directly under the
-- program when it has any program-wide or group material.
CREATE TEMP TABLE "mv2_flat_lesson" AS
SELECT
  c."id" AS "courseId",
  'mv2l_' || replace(gen_random_uuid()::text, '-', '') AS "lessonId"
FROM "Course" c
WHERE NOT EXISTS (SELECT 1 FROM "CourseModule" cm WHERE cm."courseId" = c."id")
  AND (
    EXISTS (SELECT 1 FROM "Material" m WHERE m."scope" = 'COURSE' AND m."courseId" = c."id")
    OR EXISTS (
      SELECT 1 FROM "Material" m
      JOIN "ScheduledGroup" g ON g."id" = m."scheduledGroupId"
      WHERE m."scope" = 'GROUP' AND g."courseId" = c."id"
    )
  );

INSERT INTO "Lesson" ("id", "courseId", "moduleId", "title", "sortOrder", "updatedAt")
SELECT "lessonId", "courseId", NULL, '1. lekcija', 1, CURRENT_TIMESTAMP
FROM "mv2_flat_lesson";

-- Place the materials. Order matters: probni sat first, then module lessons,
-- then radionice, then group materials.

UPDATE "Material" m
SET "scope" = 'LESSON', "lessonId" = pl."lessonId",
    "courseId" = NULL, "moduleId" = NULL, "scheduledGroupId" = NULL
FROM "mv2_probni" p
JOIN "mv2_probni_lesson" pl ON pl."courseId" = p."courseId"
WHERE m."id" = p."materialId";

UPDATE "Material" m
SET "scope" = 'LESSON', "lessonId" = ml."lessonId",
    "courseId" = NULL, "moduleId" = NULL, "scheduledGroupId" = NULL
FROM "mv2_module_lesson" ml
WHERE m."scope" = 'MODULE' AND m."moduleId" = ml."moduleId";

-- Program-wide RoboCamp guides of a program with modules that the probni sat
-- did not take (natjecanja) → the first-module lesson.
UPDATE "Material" m
SET "scope" = 'LESSON', "lessonId" = ml."lessonId",
    "courseId" = NULL, "moduleId" = NULL, "scheduledGroupId" = NULL
FROM "mv2_first_module" fm
JOIN "mv2_module_lesson" ml ON ml."moduleId" = fm."moduleId"
WHERE m."scope" = 'COURSE' AND m."type" = 'ROBOCAMP' AND m."courseId" = fm."courseId";

UPDATE "Material" m
SET "scope" = 'LESSON', "lessonId" = fl."lessonId",
    "courseId" = NULL, "moduleId" = NULL, "scheduledGroupId" = NULL
FROM "mv2_flat_lesson" fl
WHERE m."scope" = 'COURSE' AND m."courseId" = fl."courseId";

UPDATE "Material" m
SET "lessonId" = fl."lessonId", "courseId" = NULL, "moduleId" = NULL
FROM "ScheduledGroup" g
JOIN "mv2_flat_lesson" fl ON fl."courseId" = g."courseId"
WHERE m."scope" = 'GROUP' AND m."scheduledGroupId" = g."id";

UPDATE "Material" m
SET "lessonId" = ml."lessonId", "courseId" = NULL, "moduleId" = NULL
FROM "ScheduledGroup" g
JOIN "mv2_first_module" fm ON fm."courseId" = g."courseId"
JOIN "mv2_module_lesson" ml ON ml."moduleId" = fm."moduleId"
WHERE m."scope" = 'GROUP' AND m."scheduledGroupId" = g."id";

-- What is left at COURSE scope is teacher-only "whole program" material; clear
-- any stray FK the old check tolerated.
UPDATE "Material"
SET "moduleId" = NULL, "scheduledGroupId" = NULL
WHERE "scope" = 'COURSE';

DROP TABLE "mv2_first_module";
DROP TABLE "mv2_probni";
DROP TABLE "mv2_lesson_module";
DROP TABLE "mv2_module_lesson";
DROP TABLE "mv2_probni_lesson";
DROP TABLE "mv2_flat_lesson";

-- ─── Constraints ─────────────────────────────────────────────────────────────

ALTER TABLE "Material" ALTER COLUMN "audience" DROP DEFAULT;

-- The shape of a material. Kids only ever see material inside a lesson; MODULE
-- and COURSE are teacher-only "every class of this module / program".
ALTER TABLE "Material" ADD CONSTRAINT "Material_v2_shape_check"
  CHECK (
    ("scope" = 'LESSON' AND "lessonId" IS NOT NULL
      AND "scheduledGroupId" IS NULL AND "courseId" IS NULL AND "moduleId" IS NULL) OR
    ("scope" = 'GROUP' AND "lessonId" IS NOT NULL AND "scheduledGroupId" IS NOT NULL
      AND "courseId" IS NULL AND "moduleId" IS NULL) OR
    ("scope" = 'MODULE' AND "audience" = 'TEACHER' AND "moduleId" IS NOT NULL
      AND "lessonId" IS NULL AND "scheduledGroupId" IS NULL AND "courseId" IS NULL) OR
    ("scope" = 'COURSE' AND "audience" = 'TEACHER' AND "courseId" IS NOT NULL
      AND "lessonId" IS NULL AND "scheduledGroupId" IS NULL AND "moduleId" IS NULL)
  );

-- RoboCamp guides are for the children (owner decision 2026-10-10).
ALTER TABLE "Material" ADD CONSTRAINT "Material_robocamp_student_check"
  CHECK ("type" <> 'ROBOCAMP' OR "audience" = 'STUDENT');
