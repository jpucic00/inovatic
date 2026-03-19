import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/prijava')
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== 'ADMIN') redirect('/prijava')
  return session
}

export async function requireTeacher() {
  const session = await requireAuth()
  if (session.user.role !== 'TEACHER' && session.user.role !== 'ADMIN') redirect('/prijava')
  return session
}
