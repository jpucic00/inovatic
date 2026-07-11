-- Structured student assessments (Ocjene): replace the free-text MODULE_REVIEW
-- comment type with a dedicated StudentAssessment report card, and simplify
-- StudentComment down to a pure comment.

-- Delete legacy MODULE_REVIEW rows BEFORE dropping the `type` column (owner
-- decision: these free-text reviews are superseded by StudentAssessment and are
-- not migrated). Runs while `type` still exists.
DELETE FROM "StudentComment" WHERE "type" = 'MODULE_REVIEW';

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('POCETNO', 'U_RAZVOJU', 'OSTVARENO');

-- CreateEnum
CREATE TYPE "RecommendationKind" AS ENUM ('COURSE', 'COMPETITION_PREP', 'COMPETITION_PROGRAM');

-- DropForeignKey
ALTER TABLE "StudentComment" DROP CONSTRAINT "StudentComment_moduleId_fkey";

-- AlterTable
ALTER TABLE "StudentComment" DROP COLUMN "moduleId",
DROP COLUMN "type";

-- DropEnum
DROP TYPE "CommentType";

-- CreateTable
CREATE TABLE "StudentAssessment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "slaganje" "SkillLevel",
    "programiranje" "SkillLevel",
    "inovacije" "SkillLevel",
    "suradnja" "SkillLevel",
    "komunikacija" "SkillLevel",
    "zabava" "SkillLevel",
    "opisnaOcjena" TEXT,
    "recommendationKind" "RecommendationKind",
    "recommendedCourseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentAssessment_groupId_idx" ON "StudentAssessment"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAssessment_studentId_groupId_key" ON "StudentAssessment"("studentId", "groupId");

-- AddForeignKey
ALTER TABLE "StudentAssessment" ADD CONSTRAINT "StudentAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAssessment" ADD CONSTRAINT "StudentAssessment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ScheduledGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAssessment" ADD CONSTRAINT "StudentAssessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAssessment" ADD CONSTRAINT "StudentAssessment_recommendedCourseId_fkey" FOREIGN KEY ("recommendedCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
