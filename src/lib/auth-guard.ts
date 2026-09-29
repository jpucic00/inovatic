import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { activeEnrollmentWhere } from '@/lib/enrollment-activity'

async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/portal')
  // Fail closed: a session without a city claim (legacy token kept alive
  // through a transient DB error on refresh) must never reach tenant-scoped
  // queries — Prisma treats `city: undefined` in a where-clause as "no
  // filter", which would silently disable the separation.
  if (!session.user.city) redirect('/portal')
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== 'ADMIN') redirect('/portal')
  return session
}

/**
 * requireAdmin plus the caller's tenant city — the named entry point for
 * admin read actions that scope queries by city. Mutations wrapped in
 * `adminAction` receive the same city via their handler ctx instead.
 */
export async function requireAdminCtx() {
  const session = await requireAdmin()
  return { session, city: session.user.city }
}

export async function requireTeacher() {
  const session = await requireAuth()
  if (session.user.role !== 'TEACHER' && session.user.role !== 'ADMIN') redirect('/portal')
  return session
}

/**
 * A session looking at a child in the portal — a parent, or a staff member
 * whose own e-mail is a parent's, after picking the child. Returns the child's
 * id as `studentId`, which is what every portal read keys on; `session.user.id`
 * is the PARENT account and must never be used as a student id.
 *
 * No child picked yet → `/portal`, which sends a parent to the picker and staff
 * to their panel. The claim itself was proven by `isSelectableChild` when it
 * was written and is re-proven on every token revalidation (≤60s), the same
 * trust the `city` and `role` claims already get.
 */
export async function requirePortalChild() {
  const session = await requireAuth()
  const studentId = session.user.studentId
  if (!studentId || session.user.role === 'CLASSROOM') redirect('/portal')
  return { session, studentId }
}

/**
 * A child OR the shared classroom login (`CLASSROOM`) — the two things the
 * portal renders for. Only the group materials path accepts both; every other
 * child read (profile, gallery, evaluation) keeps `requirePortalChild()`, which
 * is what keeps a child's photos and report card off the classroom PCs.
 * `studentId` is null exactly for the classroom login.
 */
export async function requirePortalUser() {
  const session = await requireAuth()
  if (session.user.role === 'CLASSROOM') return { session, studentId: null }
  const studentId = session.user.studentId
  if (!studentId) redirect('/portal')
  return { session, studentId }
}

/**
 * requirePortalChild plus proof the child is currently in a program — the gate
 * for every portal read of actual course content.
 *
 * The login gate in `authorize()` and the picker normally mean no session ever
 * holds an inactive child. This closes the residual window: a claim written
 * while the child was still enrolled stays in the JWT until
 * `revalidateTokenClaims` next runs (≤60s), and `/api/download` and the portal
 * deep links authorise off that session. Without this, "no longer part of any
 * program" would be true at the door and false one URL deeper.
 *
 * Fails with `notFound()`, NOT `redirect('/portal')`: `/portal` renders the
 * dashboard for a session holding a child, so redirecting there would bounce
 * forever.
 *
 * Deliberately checks that the CHILD is active, not that the requested group
 * belongs to the active year. An enrolled child looking back at their own
 * previous group is legitimate, and year-filtering the per-group lookups would
 * quietly withdraw the parent-visible evaluation that was a deliberate decision
 * in July 2026.
 */
export async function requireActivePortalChild() {
  const ctx = await requirePortalChild()
  const active = await db.enrollment.count({
    where: { userId: ctx.studentId, ...activeEnrollmentWhere() },
  })
  if (active === 0) notFound()
  return ctx
}
