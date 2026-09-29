-- CreateEnum
CREATE TYPE "PasswordTokenPurpose" AS ENUM ('SETUP', 'RESET');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordSetAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PasswordToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "PasswordTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordToken_tokenHash_key" ON "PasswordToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordToken_userId_createdAt_idx" ON "PasswordToken"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PasswordToken" ADD CONSTRAINT "PasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordToken" ADD CONSTRAINT "PasswordToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plaintext passwords are gone for everyone but the shared classroom login
-- (owner decision 2026-09-29). Hashes are untouched, so every password that
-- works today keeps working — only the readable copy disappears. The CHECK
-- makes it impossible for any code path to write one again.
UPDATE "User" SET "plainPassword" = NULL WHERE "role" <> 'CLASSROOM' AND "plainPassword" IS NOT NULL;

ALTER TABLE "User" ADD CONSTRAINT "User_plainPassword_classroom_only"
  CHECK ("plainPassword" IS NULL OR "role" = 'CLASSROOM');

-- `credentialsSentAt` now records a password LINK mailed to the account itself
-- (a parent or staff member). On a child it meant "the parent was mailed this
-- child's username + password", which no longer exists and has no reader.
UPDATE "User" SET "credentialsSentAt" = NULL WHERE "role" = 'STUDENT' AND "credentialsSentAt" IS NOT NULL;
