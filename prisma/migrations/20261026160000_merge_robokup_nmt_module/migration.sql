-- Robokup and Natjecanje mladih tehničara become ONE module of the
-- Natjecateljski program, "Natjecanje mladih tehničara i Robokup" (owner,
-- 2026-10-26). Only the program module merges: the public /natjecanja pages
-- stay separate.
--
-- The NMT module survives (renamed); everything hanging off the Robokup module
-- moves onto it and then the Robokup row alone is deleted:
--   * Lesson.moduleId — LessonSession.moduleId follows through the composite
--     FK's ON UPDATE CASCADE. A Robokup sat number the NMT module already holds
--     would break @@unique([moduleId, sessionNumber]), so that LessonSession
--     row is dropped first and reported (the lesson and its materials move,
--     it only loses that one sat).
--   * Material.moduleId (teacher-only MODULE rows; lesson materials ride along
--     with their lesson).
--   * GalleryImage.moduleId.
--   * ModuleSchedule (natjecanja are undated, so none are expected); a
--     schedule colliding on (schoolYear, city) aborts the migration rather
--     than guess how to merge two ModuleEnrollment sets.
--
-- One DO block, so the integration test can replay the file as a single
-- statement. Idempotent: with no Robokup module left it only ensures the name.

DO $$
DECLARE
  merged_title CONSTANT TEXT := 'Natjecanje mladih tehničara i Robokup';
  course_id TEXT;
  keep_id TEXT;
  drop_id TEXT;
  dropped_sats TEXT;
  lesson_offset INT;
BEGIN
  SELECT "id" INTO course_id FROM "Course" WHERE "slug" = 'natjecateljski-program';
  IF course_id IS NULL THEN
    RETURN;
  END IF;

  SELECT "id" INTO keep_id FROM "CourseModule"
  WHERE "courseId" = course_id AND "title" IN ('Natjecanje mladih tehničara', merged_title)
  ORDER BY ("title" = merged_title) DESC, "sortOrder"
  LIMIT 1;

  SELECT "id" INTO drop_id FROM "CourseModule"
  WHERE "courseId" = course_id AND "title" = 'Robokup'
  LIMIT 1;

  IF drop_id IS NULL THEN
    IF keep_id IS NOT NULL THEN
      UPDATE "CourseModule" SET "title" = merged_title WHERE "id" = keep_id;
    END IF;
    RETURN;
  END IF;

  IF keep_id IS NULL THEN
    -- No NMT module to merge into: the Robokup module simply takes the name.
    UPDATE "CourseModule" SET "title" = merged_title WHERE "id" = drop_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ModuleSchedule" d
    JOIN "ModuleSchedule" k
      ON k."moduleId" = keep_id AND k."schoolYear" = d."schoolYear" AND k."city" = d."city"
    WHERE d."moduleId" = drop_id
  ) THEN
    RAISE EXCEPTION 'merge_robokup_nmt_module: both modules have a ModuleSchedule for the same school year and city';
  END IF;

  -- Sats both modules hold: NMT keeps its lesson on that sat.
  SELECT string_agg(l."title" || ' (sat ' || s."sessionNumber" || ')', ', ' ORDER BY s."sessionNumber")
  INTO dropped_sats
  FROM "LessonSession" s
  JOIN "Lesson" l ON l."id" = s."lessonId"
  WHERE s."moduleId" = drop_id
    AND EXISTS (
      SELECT 1 FROM "LessonSession" k
      WHERE k."moduleId" = keep_id AND k."sessionNumber" = s."sessionNumber"
    );
  IF dropped_sats IS NOT NULL THEN
    RAISE NOTICE 'merge_robokup_nmt_module: Robokup sats already held by NMT, removed from: %', dropped_sats;
    DELETE FROM "LessonSession" s
    WHERE s."moduleId" = drop_id
      AND EXISTS (
        SELECT 1 FROM "LessonSession" k
        WHERE k."moduleId" = keep_id AND k."sessionNumber" = s."sessionNumber"
      );
  END IF;

  -- Robokup's undated lessons order after NMT's, keeping their own order.
  SELECT COALESCE(MAX("sortOrder") + 1, 0) INTO lesson_offset
  FROM "Lesson" WHERE "moduleId" = keep_id;

  UPDATE "Lesson"
  SET "moduleId" = keep_id, "sortOrder" = "sortOrder" + lesson_offset
  WHERE "moduleId" = drop_id;

  UPDATE "Material" SET "moduleId" = keep_id WHERE "moduleId" = drop_id;
  UPDATE "GalleryImage" SET "moduleId" = keep_id WHERE "moduleId" = drop_id;
  UPDATE "ModuleSchedule" SET "moduleId" = keep_id WHERE "moduleId" = drop_id;

  DELETE FROM "CourseModule" WHERE "id" = drop_id;

  UPDATE "CourseModule" SET "title" = merged_title WHERE "id" = keep_id;

  -- Close the gap the deleted row left: FLL, WRO, NMT i Robokup, Pripreme.
  UPDATE "CourseModule" m
  SET "sortOrder" = r.pos
  FROM (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "sortOrder", "title")::INT AS pos
    FROM "CourseModule" WHERE "courseId" = course_id
  ) r
  WHERE m."id" = r."id";
END $$;
