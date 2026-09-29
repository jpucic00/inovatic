'use server'

import { redirect } from 'next/navigation'
import { auth, unstable_update } from '@/lib/auth'

/**
 * The picker's one write: make `studentId` the child this session looks at.
 *
 * Deliberately does NOT check ownership itself — the Auth.js `update` hook
 * (`applyChildSelection` in src/lib/auth.ts) is the only place the claim is
 * written, and it refuses any child `isSelectableChild` does not confirm. That
 * hook is reachable from the client as well, so it has to be the boundary; a
 * second check here would only be a copy that could drift. What this action
 * does check is the OUTCOME: a refused id leaves the old claim in place, and the
 * parent is sent back to the picker rather than into someone else's portal.
 */
export async function selectPortalChild(studentId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.city) redirect('/portal')

  const updated = await unstable_update({ user: { studentId } })
  if (updated?.user?.studentId !== studentId) redirect('/portal/odabir')
  redirect('/portal')
}
