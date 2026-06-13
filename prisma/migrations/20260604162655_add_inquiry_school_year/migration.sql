-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "schoolYear" TEXT;

-- CreateIndex
CREATE INDEX "Inquiry_schoolYear_idx" ON "Inquiry"("schoolYear");
