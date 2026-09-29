import type { City, PasswordTokenPurpose } from '@prisma/client'
import { db } from '@/lib/db'
import { sendPasswordLinkEmail } from '@/lib/email'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'
import {
  countRecentPasswordTokens,
  isLinkableRole,
  issuePasswordToken,
  PASSWORD_LINK_VALID_FOR,
} from '@/lib/password-token'

/**
 * Mint a link for one account and mail it — the path shared by the profile
 * buttons, `createTeacher` and the deploy-time staff rollout. The setup-link
 * campaign mints through `issuePasswordToken` directly, because it renders the
 * link inside the admin's own message.
 *
 * Plain module, not a `'use server'` file: it takes an account id unguarded, so
 * it must never be callable from a browser. Callers do the permission check.
 */

/** Sends allowed per account per hour from the profile buttons. Counted from
 *  the token table, so it survives a restart and covers every staff member at
 *  once: a compromised teacher login cannot flood a family's inbox. */
export const PROFILE_LINK_LIMIT_PER_HOUR = 3

type PasswordLinkSendResult = { ok: true; email: string } | { ok: false; error: string }

export async function isProfileLinkLimited(accountId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000)
  return (await countRecentPasswordTokens(accountId, since)) >= PROFILE_LINK_LIMIT_PER_HOUR
}

export async function sendPasswordLinkToAccount(input: {
  accountId: string
  purpose: PasswordTokenPurpose
  /** The staff member who sent it; null for the system rollout. */
  createdById: string | null
  /** Which office the mail comes from. */
  city: City
  /** A parent is told about the portal and their children; staff about the panel. */
  audience: 'PARENT' | 'STAFF'
}): Promise<PasswordLinkSendResult> {
  const account = await db.user.findUnique({
    where: { id: input.accountId },
    select: { email: true, role: true, deletedAt: true },
  })
  if (!account || account.deletedAt || !isLinkableRole(account.role)) {
    return { ok: false, error: 'Račun ne postoji ili mu se ne može poslati poveznica.' }
  }

  const children =
    input.audience === 'PARENT'
      ? await db.user.findMany({
          where: {
            parentAccountId: input.accountId,
            role: 'STUDENT',
            deletedAt: null,
            enrollments: { some: activeEnrollmentWhere() },
          },
          select: { firstName: true, lastName: true },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        })
      : []

  const { token } = await issuePasswordToken({
    userId: input.accountId,
    purpose: input.purpose,
    createdById: input.createdById,
  })

  let sent = false
  try {
    sent = await sendPasswordLinkEmail({
      to: account.email,
      city: input.city,
      purpose: input.purpose,
      audience: input.audience,
      token,
      validFor: PASSWORD_LINK_VALID_FOR[input.purpose],
      children: children.map((c) => `${c.firstName} ${c.lastName}`.trim()),
    })
  } catch (err) {
    console.error('sendPasswordLinkToAccount: send failed:', err)
  }
  // A link nobody received is not a failure to hide: the admin must know the
  // family is still waiting. The token stays behind unused and expires.
  if (!sent) return { ok: false, error: 'E-mail nije poslan. Pokušajte ponovno kasnije.' }

  await db.user
    .update({ where: { id: input.accountId }, data: { credentialsSentAt: new Date() } })
    .catch(() => {})
  return { ok: true, email: account.email }
}
