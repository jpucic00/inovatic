-- Remove isActive column from Course
-- Activity is now controlled at the ScheduledGroup level only
ALTER TABLE "Course" DROP COLUMN "isActive";
