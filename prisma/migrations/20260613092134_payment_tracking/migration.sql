-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "fullYearPaidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ModuleEnrollment" ADD COLUMN     "paidAt" TIMESTAMP(3);
