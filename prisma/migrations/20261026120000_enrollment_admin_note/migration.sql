-- Admin-only free-text note per enrollment. Additive, no backfill: every
-- existing enrollment simply has no note.
ALTER TABLE "Enrollment" ADD COLUMN "adminNote" TEXT;
