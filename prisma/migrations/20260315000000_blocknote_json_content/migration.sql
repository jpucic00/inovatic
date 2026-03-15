-- Drop old text column and recreate as JSONB
ALTER TABLE "Article" DROP COLUMN "content";
ALTER TABLE "Article" ADD COLUMN "content" JSONB NOT NULL DEFAULT '[]';
