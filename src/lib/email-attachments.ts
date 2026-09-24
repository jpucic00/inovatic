/**
 * Server-side reads and writes for /admin/email attachments.
 *
 * A plain module, NOT `'use server'`: these take ids with no guard of their own
 * (the callers — the campaign actions and the two routes — have already
 * resolved the admin's city), and every export of a `'use server'` file would
 * be published as a callable endpoint.
 *
 * Campaign-level only, by owner decision: every recipient gets the same files,
 * so nothing here ever needs to know who a mail is for.
 */
import type { City, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  DRAFT_ATTACHMENT_TTL_MS,
  attachmentSetError,
  type AttachmentSummary,
  type EmailAttachmentFile,
} from '@/lib/email-attachment-rules'

/** Upload order is the order the parent sees them in. */
const ATTACHMENT_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.EmailAttachmentOrderByWithRelationInput[]

const MISSING_DRAFT_ERROR =
  'Privitak više nije dostupan (istekao je ili je uklonjen). Dodajte ga ponovno.'

/**
 * Deletes drafts nobody sent. Called by every upload rather than by a cron —
 * the app has none, and an abandoned draft waiting for the next upload costs
 * nothing. Linked rows are untouchable here by construction (`campaignId: null`).
 */
export async function sweepStaleDraftAttachments(now: Date = new Date()): Promise<number> {
  const { count } = await db.emailAttachment.deleteMany({
    where: {
      campaignId: null,
      createdAt: { lt: new Date(now.getTime() - DRAFT_ATTACHMENT_TTL_MS) },
    },
  })
  return count
}

/**
 * One attachment row with its bytes. A draft (`campaignId: null`) from the
 * composer's upload, or a file the server generated for a campaign it is
 * creating — pass that campaign's transaction so the file and the campaign
 * commit together.
 */
export async function storeAttachment(
  client: Pick<Prisma.TransactionClient, 'emailAttachment'>,
  input: {
    city: City
    campaignId: string | null
    filename: string
    mimeType: string
    data: Buffer
  },
): Promise<{ id: string; filename: string; bytes: number; mimeType: string }> {
  return client.emailAttachment.create({
    data: {
      city: input.city,
      campaignId: input.campaignId,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.data.length,
      // A copy: Prisma's Bytes wants a plain ArrayBuffer-backed array, and a
      // rendered PDF's Buffer may sit on a shared pool.
      content: { create: { data: new Uint8Array(input.data) } },
    },
    select: { id: true, filename: true, bytes: true, mimeType: true },
  })
}

type DraftAttachmentsResult =
  | { ok: true; attachments: AttachmentSummary[] }
  | { ok: false; error: string }

/**
 * The composer's drafts, checked the way a send needs them: every id exists,
 * belongs to this city, is still a draft, and the set fits the limits. Anything
 * else is a refusal — a campaign must never go out quietly missing a contract
 * the admin attached.
 */
export async function loadDraftAttachments(
  ids: readonly string[],
  city: City,
): Promise<DraftAttachmentsResult> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return { ok: true, attachments: [] }

  const rows = await db.emailAttachment.findMany({
    where: { id: { in: unique }, city, campaignId: null },
    orderBy: ATTACHMENT_ORDER,
    select: { filename: true, bytes: true },
  })
  if (rows.length !== unique.length) return { ok: false, error: MISSING_DRAFT_ERROR }

  const error = attachmentSetError(rows)
  if (error) return { ok: false, error }
  return { ok: true, attachments: rows }
}

/** Thrown inside the campaign transaction so the whole campaign rolls back. */
export class AttachmentLinkError extends Error {
  constructor() {
    super(MISSING_DRAFT_ERROR)
    this.name = 'AttachmentLinkError'
  }
}

/**
 * Turns the drafts into the campaign's attachments, inside the transaction that
 * creates the campaign.
 *
 * The `campaignId: null` condition is what makes this safe against the sweep
 * and against a second campaign racing for the same draft: either this claims
 * every file, or the count comes up short and the campaign is not created. A
 * campaign can never end up with half its attachments.
 */
export async function linkDraftAttachments(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
  city: City,
  campaignId: string,
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const { count } = await tx.emailAttachment.updateMany({
    where: { id: { in: unique }, city, campaignId: null },
    data: { campaignId },
  })
  if (count !== unique.length) throw new AttachmentLinkError()
}

/** Names and sizes only — for the mail's "Prilozi" list and the history page. */
export async function loadCampaignAttachmentSummaries(
  campaignId: string,
): Promise<(AttachmentSummary & { id: string })[]> {
  return db.emailAttachment.findMany({
    where: { campaignId },
    orderBy: ATTACHMENT_ORDER,
    select: { id: true, filename: true, bytes: true },
  })
}

/**
 * The files themselves, for the send job. Loaded ONCE per run, before any
 * recipient is claimed, so a failure here leaves every row PENDING for
 * "Nastavi slanje" instead of failing parents one by one.
 */
export async function loadCampaignAttachmentFiles(
  campaignId: string,
): Promise<EmailAttachmentFile[]> {
  const rows = await db.emailAttachment.findMany({
    where: { campaignId },
    orderBy: ATTACHMENT_ORDER,
    select: {
      filename: true,
      mimeType: true,
      bytes: true,
      content: { select: { data: true } },
    },
  })
  return rows.map((row) => {
    if (!row.content) {
      throw new Error(`Privitak "${row.filename}" nema sadržaja.`)
    }
    return {
      filename: row.filename,
      bytes: row.bytes,
      contentType: row.mimeType,
      content: Buffer.from(row.content.data),
    }
  })
}
