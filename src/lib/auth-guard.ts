import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/prijava')
  // Fail closed: a session without a city claim (legacy token kept alive
  // through a transient DB error on refresh) must never reach tenant-scoped
  // queries — Prisma treats `city: undefined` in a where-clause as "no
  // filter", which would silently disable the separation.
  if (!session.user.city) redirect('/prijava')
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== 'ADMIN') redirect('/prijava')
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
  if (session.user.role !== 'TEACHER' && session.user.role !== 'ADMIN') redirect('/prijava')
  return session
}

export async function requireStudent() {
  const session = await requireAuth()
  if (session.user.role !== 'STUDENT') redirect('/prijava')
  return session
}
