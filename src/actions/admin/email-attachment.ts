'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'

/**
 * The composer's × on an attached file. Deletes a DRAFT only — a file already
 * sent with a campaign is that campaign's record and "Nastavi slanje" still
 * needs it, so the `campaignId: null` condition makes a sent one untouchable
 * here. Idempotent: removing a draft the sweep already took is not an error.
 */
export async function deleteDraftEmailAttachment(
  attachmentId: string,
): Promise<{ success: true }> {
  const { city } = await requireAdminCtx()
  if (typeof attachmentId !== 'string' || attachmentId.length === 0) return { success: true }
  await db.emailAttachment.deleteMany({
    where: { id: attachmentId, city, campaignId: null },
  })
  return { success: true }
}
