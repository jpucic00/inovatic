-- AlterEnum
-- Alone in its file on purpose: Postgres refuses to USE a freshly added enum
-- value inside the transaction that added it, and the next migration inserts
-- rows carrying it.
ALTER TYPE "UserRole" ADD VALUE 'CLASSROOM';
