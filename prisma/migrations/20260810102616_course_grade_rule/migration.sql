-- CreateTable
CREATE TABLE "CourseGradeRule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "grades" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseGradeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseGradeRule_schoolYear_city_idx" ON "CourseGradeRule"("schoolYear", "city");

-- CreateIndex
CREATE UNIQUE INDEX "CourseGradeRule_courseId_schoolYear_city_key" ON "CourseGradeRule"("courseId", "schoolYear", "city");

-- AddForeignKey
ALTER TABLE "CourseGradeRule" ADD CONSTRAINT "CourseGradeRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
