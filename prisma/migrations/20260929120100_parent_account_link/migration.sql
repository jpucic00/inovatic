-- Additive and nullable: existing children start with no parent account and
-- are linked by `npm run db:create-parent-accounts` (dry-run by default), so
-- the migration itself decides nothing about which children share a family.
ALTER TABLE "User" ADD COLUMN "parentAccountId" TEXT;

CREATE INDEX "User_parentAccountId_idx" ON "User"("parentAccountId");

ALTER TABLE "User" ADD CONSTRAINT "User_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
