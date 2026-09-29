import type { UserRole } from '@prisma/client'
import { db } from '@/lib/db'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'
import type { PortalChoices, PortalPanel } from '@/lib/portal-landing'

/**
 * Which children a logged-in account may open in the portal, and what it is
 * offered after login.
 *
 * Since 2026-09-29 a child never signs in: the login belongs to the parent
 * e-mail (a PARENT account, or a staff account the parent's e-mail happens to
 * be), and the session carries the child picked after login as `studentId`.
 * This module is the ONE definition of "may this account act as this child" —
 * the login gate, the picker, the token revalidation and the Auth.js `update`
 * hook all ask it, so they cannot disagree about a family.
 *
 * Plain module, not a `'use server'` file: these take ids unguarded, and every
 * export of a `'use server'` module is a callable endpoint.
 */

/** Linked, not deleted, and in an active program — what the portal will open. */
function selectableChildWhere(accountId: string) {
  return {
    role: 'STUDENT' as const,
    parentAccountId: accountId,
    deletedAt: null,
    enrollments: { some: activeEnrollmentWhere() },
  }
}


export async function listPortalChildren(accountId: string): Promise<PortalChoices['children']> {
  return db.user.findMany({
    where: selectableChildWhere(accountId),
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
}

export async function countPortalChildren(accountId: string): Promise<number> {
  return db.user.count({ where: selectableChildWhere(accountId) })
}

/**
 * Whether `accountId` may act as `studentId` right now. The security boundary
 * for the session's `studentId` claim: Auth.js lets the CLIENT post arbitrary
 * data to the `update` hook, so a claim is only ever written after this says
 * yes, and re-checked on every token revalidation.
 */
export async function isSelectableChild(accountId: string, studentId: string): Promise<boolean> {
  const count = await db.user.count({
    where: { id: studentId, ...selectableChildWhere(accountId) },
  })
  return count > 0
}

/**
 * Everything an account can open after login: its staff panels and its
 * children. Drives both the post-login routing and the `/portal/odabir` page.
 *
 * A dual-role admin keeps getting the teacher panel only when she actually
 * teaches (the pre-existing landing rule); the sidebar shortcut to /nastavnik
 * stays unconditional and is not this function's business.
 */
export async function portalChoicesFor(
  accountId: string,
  role: UserRole,
): Promise<PortalChoices> {
  if (role === 'CLASSROOM' || role === 'STUDENT') return { panels: [], children: [] }

  const children = await listPortalChildren(accountId)
  const panels: PortalPanel[] = []
  if (role === 'ADMIN') {
    panels.push('admin')
    const teaches = await db.teacherAssignment.count({ where: { userId: accountId } })
    if (teaches > 0) panels.push('teacher')
  } else if (role === 'TEACHER') {
    panels.push('teacher')
  }
  return { panels, children }
}

/**
 * The picker's write path. Auth.js routes BOTH `unstable_update()` on the
 * server and a client `update()` posted to /api/auth/session into this hook
 * with whatever data the caller sent, so the requested child is trusted only
 * after `isSelectableChild` confirms this account may open it. Anything else —
 * a foreign id, a child who left every program, a malformed value — leaves the
 * claim exactly as it was. `null` clears it (back to the picker).
 */
export async function applyChildSelection(
  token: { id?: string; studentId?: string },
  session: unknown,
): Promise<void> {
  const requested = (session as { user?: { studentId?: unknown } } | undefined)?.user?.studentId
  if (requested === null) {
    delete token.studentId
    return
  }
  if (typeof requested !== 'string' || !token.id) return
  try {
    if (await isSelectableChild(token.id, requested)) token.studentId = requested
  } catch (err) {
    // Nothing is granted on a failed check; the picker reports it didn't take.
    console.error('child selection check failed:', err)
  }
}

/** The picked child's name for the portal header; null if it cannot be read. */
export async function portalChildName(studentId: string): Promise<string | null> {
  const child = await db.user.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  })
  return child ? `${child.firstName} ${child.lastName}`.trim() : null
}
