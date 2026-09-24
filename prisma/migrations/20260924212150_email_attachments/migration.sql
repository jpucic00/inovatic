-- Privitci u e-mail kampanjama (2026-09-24, Flux wnm3ru4). Purely additive:
-- two new tables, nothing existing is altered, so there is nothing to backfill.
-- Campaigns sent before this simply have no attachments.

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "campaignId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachmentContent" (
    "attachmentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "EmailAttachmentContent_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "EmailAttachment_campaignId_createdAt_idx" ON "EmailAttachment"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachmentContent" ADD CONSTRAINT "EmailAttachmentContent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "EmailAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
