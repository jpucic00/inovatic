-- Add price field for radionice (single workshop price)
ALTER TABLE "Course" ADD COLUMN "price" DOUBLE PRECISION;

-- Make equipment nullable (radionice don't have equipment)
ALTER TABLE "Course" ALTER COLUMN "equipment" DROP NOT NULL;
