import type { City, Prisma } from '@prisma/client'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'
import { emailCandidatesWhere, pickExactEmail } from '@/lib/email-lookup'
import { unusablePasswordHash } from '@/lib/password'

/**
 * Linking a child to the ONE account that sees it in the portal.
 *
 * Owner decisions (2026-09-29): the family login is the parent's e-mail, one
 * account per address; a child has exactly one such account; and a newer upit
 * from the other parent MOVES the child rather than adding a second link. The
 * e-mail is therefore the family identity from here on — which is exactly why
 * nothing here moves a child silently. Every link that changes who can see a
 * child's grades and photos (a move away from another address, a join onto an
 * account that already sees other children, a staff account) comes back as
 * `needsConfirm`, and the admin action refuses to write it without the admin's
 * explicit yes. A public upit alone never gets this far: only an admin creating
 * the account or editing the child reaches `applyParentLink`.
 *
 * Plain module taking a transaction client: it is called from inside the
 * creation transactions and takes ids unguarded, so it must not be a
 * `'use server'` file.
 */

type Tx = Prisma.TransactionClient

/** What the admin is asked to confirm. Names only what their city may see. */
export type ParentLinkPreview = {
  /** The address the child will be linked to. */
  email: string
  /** Set when the child is currently linked to a DIFFERENT address. */
  previousEmail: string | null
  /** The address belongs to a teacher or admin rather than a parent account. */
  staffName: string | null
  /** Children that account already sees, in the admin's own city. */
  otherChildren: string[]
  /** How many more it sees in the other city — counted, never named. */
  otherCityChildren: number
}

type ParentLinkPlan =
  /** No usable address: a new child gets no account, an existing link stays. */
  | { kind: 'NONE' }
  /** Already linked to exactly this account. */
  | { kind: 'UNCHANGED' }
  | { kind: 'REFUSED'; reason: string }
  | {
      kind: 'LINK'
      /** Existing account to link to; null = create a PARENT account. */
      targetId: string | null
      preview: ParentLinkPreview
      needsConfirm: boolean
    }

/** The action result an admin dialog renders the confirmation from. */
export type ParentLinkConfirmation = { code: 'PARENT_LINK_CONFIRM'; parentLink: ParentLinkPreview }

/** Thrown inside a creation transaction to roll it back and ask the admin. */
export class ParentLinkConfirmRequired extends Error {
  constructor(readonly preview: ParentLinkPreview) {
    super('parent link needs confirmation')
  }
}

export class ParentLinkRefused extends Error {}

/** "Ivana Anić" → Ivana / Anić; one word → first name only. */
export function splitParentName(parentName: string | null | undefined): {
  firstName: string
  lastName: string
} {
  const words = (parentName ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { firstName: '', lastName: '' }
  if (words.length === 1) return { firstName: words[0], lastName: '' }
  return { firstName: words.slice(0, -1).join(' '), lastName: words.at(-1) ?? '' }
}

export async function planParentLink(
  tx: Tx,
  input: { studentId: string | null; parentEmail: string | null | undefined; city: City },
): Promise<ParentLinkPlan> {
  const email = normalizeParentEmail(input.parentEmail ?? null)
  if (!email) return { kind: 'NONE' }

  const current = input.studentId
    ? await tx.user.findUnique({
        where: { id: input.studentId },
        select: { parentAccount: { select: { id: true, email: true } } },
      })
    : null
  const currentAccount = current?.parentAccount ?? null

  // Exact match: the ILIKE pattern alone could name another family's account.
  const target = pickExactEmail(
    await tx.user.findMany({
      where: emailCandidatesWhere(email),
      select: { id: true, email: true, role: true, deletedAt: true, firstName: true, lastName: true },
    }),
    email,
  )

  if (target && currentAccount?.id === target.id) return { kind: 'UNCHANGED' }

  if (target && (target.deletedAt || target.role === 'STUDENT' || target.role === 'CLASSROOM')) {
    return {
      kind: 'REFUSED',
      reason: `E-mail ${email} pripada računu koji ne može biti roditeljski. Upišite drugu adresu roditelja.`,
    }
  }

  const siblings = target
    ? await tx.user.findMany({
        where: {
          parentAccountId: target.id,
          role: 'STUDENT',
          deletedAt: null,
          ...(input.studentId ? { id: { not: input.studentId } } : {}),
        },
        select: { firstName: true, lastName: true, city: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      })
    : []
  const sameCity = siblings.filter((s) => s.city === input.city)
  const isStaff = target?.role === 'ADMIN' || target?.role === 'TEACHER'

  const preview: ParentLinkPreview = {
    email,
    previousEmail: currentAccount?.email ?? null,
    staffName: isStaff && target ? `${target.firstName} ${target.lastName}`.trim() : null,
    otherChildren: sameCity.map((s) => `${s.firstName} ${s.lastName}`.trim()),
    otherCityChildren: siblings.length - sameCity.length,
  }

  return {
    kind: 'LINK',
    targetId: target?.id ?? null,
    preview,
    needsConfirm:
      preview.previousEmail !== null || isStaff || siblings.length > 0,
  }
}

/**
 * Carry a plan out. `confirmed` is the admin's answer to `needsConfirm`; a plan
 * that needs it and does not have it throws {@link ParentLinkConfirmRequired},
 * which the creation transactions let roll everything back.
 */
export async function applyParentLink(
  tx: Tx,
  plan: ParentLinkPlan,
  input: { studentId: string; parentName: string | null | undefined; city: City; confirmed: boolean },
): Promise<void> {
  if (plan.kind === 'NONE' || plan.kind === 'UNCHANGED') return
  if (plan.kind === 'REFUSED') throw new ParentLinkRefused(plan.reason)
  if (plan.needsConfirm && !input.confirmed) throw new ParentLinkConfirmRequired(plan.preview)

  let accountId = plan.targetId
  if (!accountId) {
    const created = await tx.user.create({
      data: {
        email: plan.preview.email,
        // Nobody can sign in until the parent sets a password through a link.
        passwordHash: await unusablePasswordHash(),
        ...splitParentName(input.parentName),
        role: 'PARENT',
        // Only picks which office writes to them; a parent account reaches its
        // children in any city.
        city: input.city,
      },
      select: { id: true },
    })
    accountId = created.id
  }

  await tx.user.update({
    where: { id: input.studentId },
    data: { parentAccountId: accountId },
  })
}
