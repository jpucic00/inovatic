-- Receipt table for the release e-mail (Flux 6r2livk). Purely additive: a new
-- table, no column touched, nothing to backfill.
--
-- Starting EMPTY is the correct state and needs no seeding. `src/lib/releases.ts`
-- ships empty in the same commit, so the first version this database ever sees
-- is the first one `/release` writes — there is no history here to mark as
-- "already announced", and therefore no risk of the deploy that creates this
-- table mailing anyone about the past.
CREATE TABLE "ReleaseAnnouncement" (
    "version" TEXT NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReleaseAnnouncement_pkey" PRIMARY KEY ("version")
);
