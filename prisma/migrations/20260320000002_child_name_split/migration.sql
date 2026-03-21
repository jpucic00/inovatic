-- Make childName nullable (backward compat) and add separate first/last name fields
ALTER TABLE "Inquiry" ALTER COLUMN "childName" DROP NOT NULL;
ALTER TABLE "Inquiry" ADD COLUMN "childFirstName" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "childLastName" TEXT;
