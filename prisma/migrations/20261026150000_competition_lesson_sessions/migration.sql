-- Natjecanje lessons hold weekly season sats (1..52), not only a standard
-- module's 0..7. The per-kind bound is enforced in the app (lessonPlacementError);
-- this keeps the DB from accepting anything outside the widest one.
ALTER TABLE "LessonSession" DROP CONSTRAINT "LessonSession_number_check";
ALTER TABLE "LessonSession" ADD CONSTRAINT "LessonSession_number_check"
  CHECK ("sessionNumber" BETWEEN 0 AND 52);
