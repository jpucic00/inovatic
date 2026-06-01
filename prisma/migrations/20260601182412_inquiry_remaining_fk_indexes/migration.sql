-- Completes FK-index coverage on Inquiry. Migration 20260524171305 added
-- indexes on scheduledGroupId + status; this adds the remaining three FK
-- columns so every Inquiry foreign key is backed by an index:
--   assignedGroupId — getStudent joins on the inquiry detail page (source
--                     inquiry behind the "Profil ucenika ->" link), plus any
--                     future "all inquiries for this group" admin view.
--   courseId        — the admin Upiti program filter (/admin/upiti?courseId=)
--                     via getInquiries' courseIdFilter().
--   studentId       — getStudent's reverse lookup for an account's originating
--                     inquiry, and the GDPR delete cleanup in admin/student.ts.
--
-- Plain CREATE INDEX (not CONCURRENTLY) is intentional, same as the previous
-- index migration. Prisma migrate wraps each migration file in a session-level
-- transaction, and CREATE INDEX CONCURRENTLY rejects that ("cannot run inside
-- a transaction block"). On the Inquiry table — a few hundred rows in
-- production — a regular CREATE INDEX completes in well under a second, so the
-- ACCESS EXCLUSIVE lock is short enough to be effectively non-blocking.

-- CreateIndex
CREATE INDEX "Inquiry_assignedGroupId_idx" ON "Inquiry"("assignedGroupId");

-- CreateIndex
CREATE INDEX "Inquiry_courseId_idx" ON "Inquiry"("courseId");

-- CreateIndex
CREATE INDEX "Inquiry_studentId_idx" ON "Inquiry"("studentId");
