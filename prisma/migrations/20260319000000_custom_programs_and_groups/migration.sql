-- AlterTable Course: make level optional, add isCustom
ALTER TABLE "Course" ALTER COLUMN "level" DROP NOT NULL;
ALTER TABLE "Course" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable ScheduledGroup: make fields optional, change dayOfWeek type, rename maxCapacity, add enrollment window
ALTER TABLE "ScheduledGroup" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "ScheduledGroup" ALTER COLUMN "dayOfWeek" TYPE TEXT USING "dayOfWeek"::TEXT;
ALTER TABLE "ScheduledGroup" ALTER COLUMN "dayOfWeek" DROP NOT NULL;
ALTER TABLE "ScheduledGroup" ALTER COLUMN "startTime" DROP NOT NULL;
ALTER TABLE "ScheduledGroup" ALTER COLUMN "endTime" DROP NOT NULL;
ALTER TABLE "ScheduledGroup" ALTER COLUMN "schoolYear" DROP NOT NULL;
ALTER TABLE "ScheduledGroup" RENAME COLUMN "maxCapacity" TO "maxStudents";
ALTER TABLE "ScheduledGroup" ALTER COLUMN "maxStudents" SET DEFAULT 12;
ALTER TABLE "ScheduledGroup" ADD COLUMN "enrollmentStart" TIMESTAMP(3);
ALTER TABLE "ScheduledGroup" ADD COLUMN "enrollmentEnd" TIMESTAMP(3);

-- AlterTable Inquiry: add courseId and scheduledGroupId (parent's preference)
ALTER TABLE "Inquiry" ADD COLUMN "courseId" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "scheduledGroupId" TEXT;

-- AddForeignKey Inquiry -> Course
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey Inquiry -> ScheduledGroup (preferred group)
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_scheduledGroupId_fkey" FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
