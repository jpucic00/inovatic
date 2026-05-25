-- CreateTable
CREATE TABLE "SchoolYearHoliday" (
    "id" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolYearHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolYearHoliday_schoolYear_idx" ON "SchoolYearHoliday"("schoolYear");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYearHoliday_schoolYear_date_key" ON "SchoolYearHoliday"("schoolYear", "date");

-- AddForeignKey
ALTER TABLE "SchoolYearHoliday" ADD CONSTRAINT "SchoolYearHoliday_schoolYear_fkey" FOREIGN KEY ("schoolYear") REFERENCES "SchoolYear"("label") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolYearHoliday" ADD CONSTRAINT "SchoolYearHoliday_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
