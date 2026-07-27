-- DropForeignKey
ALTER TABLE "TeacherAttendance" DROP CONSTRAINT "TeacherAttendance_scheduledGroupId_fkey";

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_scheduledGroupId_fkey" FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
