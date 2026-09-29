-- AlterEnum
-- Alone in its file on purpose (same as `classroom_role`): Postgres refuses to
-- USE a freshly added enum value inside the transaction that added it.
ALTER TYPE "UserRole" ADD VALUE 'PARENT';
