import { Prisma } from '@prisma/client'
import { croatianPlural } from '@/lib/format'

// Deleting a group vs the upiti that point at it.
//
// Only an UNRESOLVED upit (status NEW — waitlisted or not) blocks the delete:
// it is still waiting for an answer about this very group. A resolved one
// (ACCOUNT_CREATED, DECLINED) is the family's record, not the group's, so it
// survives and only loses its link — both Inquiry→ScheduledGroup FKs are
// ON DELETE SET NULL, which is what clears `scheduledGroupId` /
// `assignedGroupId` in the same statement that drops the group.
//
// "Points at" includes the lista čekanja: a waitlisted NEW upit lists the
// groups the family CAN attend (`InquiryWaitlistGroup`, ON DELETE CASCADE), and
// deleting one of them silently shortens what it is waiting for — down to
// nothing, a state the waitlist form itself refuses.

export function openGroupInquiryWhere(groupIds: string[]): Prisma.InquiryWhereInput {
  return {
    status: 'NEW',
    OR: [
      { scheduledGroupId: { in: groupIds } },
      { assignedGroupId: { in: groupIds } },
      { waitlistGroups: { some: { scheduledGroupId: { in: groupIds } } } },
    ],
  }
}

/** What `tallyOpenInquiries` reads off each row of `openGroupInquiryWhere`. */
export const OPEN_INQUIRY_SELECT = {
  scheduledGroupId: true,
  assignedGroupId: true,
  waitlistGroups: { select: { scheduledGroupId: true } },
} as const satisfies Prisma.InquirySelect

/** Per-group count of unresolved upiti, for the list's delete button. */
export function tallyOpenInquiries(
  rows: {
    scheduledGroupId: string | null
    assignedGroupId: string | null
    waitlistGroups: { scheduledGroupId: string }[]
  }[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    // A row naming the same group twice (or more) is still one upit.
    const named = [row.scheduledGroupId, row.assignedGroupId, ...row.waitlistGroups.map((w) => w.scheduledGroupId)]
    for (const id of new Set(named)) {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

export function openInquiriesPhrase(n: number): string {
  return `${n} ${croatianPlural(n, 'neobrađeni upit', 'neobrađena upita', 'neobrađenih upita')}`
}

/**
 * Row-locks the groups for the rest of the transaction. Inserting an upit (or
 * an enrollment) that references a group takes a KEY SHARE lock on it, which
 * conflicts with this one — so a parent submitting the form mid-delete waits,
 * then fails on the FK, instead of being saved with its termin silently
 * nulled by SET NULL.
 */
export async function lockGroupsForDelete(
  tx: Prisma.TransactionClient,
  groupIds: string[],
): Promise<void> {
  if (groupIds.length === 0) return
  await tx.$queryRaw`SELECT id FROM "ScheduledGroup" WHERE id IN (${Prisma.join(groupIds)}) FOR UPDATE`
}
