-- Make childAge nullable and add childDateOfBirth
ALTER TABLE "Inquiry" ALTER COLUMN "childAge" DROP NOT NULL;
ALTER TABLE "Inquiry" ADD COLUMN "childDateOfBirth" TEXT;
