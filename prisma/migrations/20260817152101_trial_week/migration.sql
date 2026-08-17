-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "trialDate" DATE,
ADD COLUMN     "wantsTrial" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TrialWeek" (
    "id" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialWeek_schoolYear_idx" ON "TrialWeek"("schoolYear");

-- CreateIndex
CREATE UNIQUE INDEX "TrialWeek_schoolYear_city_key" ON "TrialWeek"("schoolYear", "city");
