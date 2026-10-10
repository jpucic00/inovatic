-- Materijali v2 (Flux av4885t). Enum changes live in their own migration:
-- Postgres refuses to USE a value added by ALTER TYPE ... ADD VALUE inside the
-- same transaction, and the next migration writes scope = 'LESSON'.

-- CreateEnum
CREATE TYPE "MaterialAudience" AS ENUM ('STUDENT', 'TEACHER');

-- AlterEnum
ALTER TYPE "MaterialScope" ADD VALUE 'LESSON';
