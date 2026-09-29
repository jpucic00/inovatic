import type { City, UserRole } from '@prisma/client'
import { normalizeParentEmail } from '@/lib/bulk-email-recipients'
import { splitParentName } from '@/lib/parent-account'

/**
 * The pure half of `npm run db:create-parent-accounts`: group every existing
 * child by its parent's e-mail into one family login, and say out loud
 * everything that grouping cannot do cleanly. No I/O — the script feeds it rows
 * and writes what it returns, so the whole decision is unit-testable.
 *
 * Deliberately conservative:
 *  - a child that already HAS a parent account is never touched (the script is
 *    re-runnable, and a link an admin confirmed must not be undone by a batch);
 *  - an address that belongs to a child or classroom login, or to a deleted
 *    account, is refused rather than guessed around;
 *  - an address that belongs to staff links the children to that staff account
 *    (the same rule the admin dialogs follow) and is listed, so the owner sees it.
 */

export type BackfillStudent = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  parentName: string | null
  parentEmail: string | null
  parentAccountId: string | null
  city: City
  createdAt: Date
}

export type BackfillAccount = {
  id: string
  email: string
  role: UserRole
  deletedAt: Date | null
}

export type BackfillFamily = {
  email: string
  /** Existing account to link to; null = a PARENT account is created. */
  accountId: string | null
  accountRole: UserRole | null
  /** For a new account: split from the newest child's `parentName`. */
  firstName: string
  lastName: string
  /** For a new account: the newest child's city — it only picks the sender. */
  city: City
  childIds: string[]
  childNames: string[]
  cities: City[]
}

type BackfillPlan = {
  families: BackfillFamily[]
  /** Children with no usable address — no portal until an admin fixes it. */
  noEmail: { id: string; name: string; raw: string | null }[]
  /** Addresses read out of an Outlook "Ime <a@b>" paste or re-cased. */
  cleaned: { name: string; raw: string; email: string }[]
  /** Address owned by a login that can never be a parent's. */
  refused: { email: string; childNames: string[]; reason: string }[]
  /** Already linked — skipped, which is what makes a re-run a no-op. */
  alreadyLinked: number
  /**
   * Linked children with no birth date (workbook imports). A future upit finds
   * them only by name + THIS e-mail, so if the other parent signs them up with
   * a different address they will not be recognised and a second child record
   * is created — existing behaviour, listed so the size of it is known.
   */
  withoutDob: number
}

const childName = (s: BackfillStudent) => `${s.firstName} ${s.lastName}`.trim()

export function planParentBackfill(
  students: BackfillStudent[],
  accounts: BackfillAccount[],
): BackfillPlan {
  const accountByEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a]))
  const byEmail = new Map<string, BackfillStudent[]>()
  const plan: BackfillPlan = {
    families: [],
    noEmail: [],
    cleaned: [],
    refused: [],
    alreadyLinked: 0,
    withoutDob: 0,
  }

  for (const student of students) {
    if (student.parentAccountId) {
      plan.alreadyLinked++
      continue
    }
    const email = normalizeParentEmail(student.parentEmail)
    if (!email) {
      plan.noEmail.push({ id: student.id, name: childName(student), raw: student.parentEmail })
      continue
    }
    if (student.parentEmail?.trim() !== email) {
      plan.cleaned.push({ name: childName(student), raw: student.parentEmail ?? '', email })
    }
    const list = byEmail.get(email) ?? []
    list.push(student)
    byEmail.set(email, list)
  }

  for (const [email, children] of byEmail) {
    const newestFirst = [...children].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const names = newestFirst.map(childName)
    const account = accountByEmail.get(email) ?? null

    if (account && (account.deletedAt || account.role === 'STUDENT' || account.role === 'CLASSROOM')) {
      plan.refused.push({
        email,
        childNames: names,
        reason: account.deletedAt ? 'obrisani račun' : `račun uloge ${account.role}`,
      })
      continue
    }

    plan.withoutDob += children.filter((c) => !c.dateOfBirth).length
    const newest = newestFirst[0]
    plan.families.push({
      email,
      accountId: account?.id ?? null,
      accountRole: account?.role ?? null,
      ...splitParentName(newestFirst.find((c) => c.parentName?.trim())?.parentName),
      city: newest.city,
      childIds: newestFirst.map((c) => c.id),
      childNames: names,
      cities: [...new Set(children.map((c) => c.city))],
    })
  }

  plan.families.sort((a, b) => a.email.localeCompare(b.email))
  return plan
}
