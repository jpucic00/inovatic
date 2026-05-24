-- Capacity-preview hot paths filter Inquiry by scheduledGroupId (the
-- preferredInquiries _count relation in computeGroupCapacity /
-- assertGroupHasAvailableSpot / getActivePrograms) and by status (the
-- admin Upiti list in getInquiries). Without indexes both fall back to
-- sequential scans on every program-page render.
--
-- Plain CREATE INDEX (not CONCURRENTLY) is intentional. Prisma migrate
-- wraps each migration file in a session-level transaction, and
-- CREATE INDEX CONCURRENTLY rejects that ("cannot run inside a
-- transaction block"). On the Inquiry table — a few hundred rows in
-- production — a regular CREATE INDEX completes in well under a second,
-- so the ACCESS EXCLUSIVE lock is short enough to be effectively
-- non-blocking. The acceptance criterion qualifies CONCURRENTLY with
-- "where possible on Postgres"; Prisma's transaction wrapper makes it
-- not possible here.

-- CreateIndex
CREATE INDEX "Inquiry_scheduledGroupId_idx" ON "Inquiry"("scheduledGroupId");

-- CreateIndex
CREATE INDEX "Inquiry_status_idx" ON "Inquiry"("status");
