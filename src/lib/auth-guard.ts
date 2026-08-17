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

export async function requireStudent() {
  const session = await requireAuth()
  if (session.user.role !== 'STUDENT') redirect('/portal')
  return session
}

/**
 * requireStudent plus proof the child is currently in a program — the gate for
 * every student-facing read of actual course content.
 *
 * The login gate in `authorize()` is the primary one and normally means nobody
 * without an active enrollment ever holds a session. This closes the residual
 * window: a JWT minted while the child was still enrolled stays valid until
 * `revalidateTokenClaims` next runs (≤60s), and `/api/download` and the portal
 * deep links authorise off that session. Without this, "no longer part of any
 * program" would be true at the door and false one URL deeper.
 *
 * Fails with `notFound()`, NOT `redirect('/portal')`: `/portal` renders the
 * dashboard for a STUDENT session, so redirecting there would bounce forever.
 *
 * Deliberately checks that the CALLER is active, not that the requested group
 * belongs to the active year. An enrolled child looking back at their own
 * previous group is legitimate, and year-filtering the per-group lookups would
 * quietly withdraw the parent-visible evaluation that was a deliberate decision
 * in July 2026.
 */
export async function requireActiveStudent() {
  const session = await requireStudent()
  const active = await db.enrollment.count({
    where: { userId: session.user.id, ...activeEnrollmentWhere() },
  })
  if (active === 0) notFound()
  return session
}
