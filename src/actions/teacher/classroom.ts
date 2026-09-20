'use server'

import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'

export type ClassroomCredentials = { username: string; password: string }

/**
 * The shared classroom login of the caller's city, for the card on /nastavnik.
 *
 * City from the session, never a parameter — a Šibenik teacher can never read
 * Split's login, and an admin (tenant pass-through) sees their own city's.
 * Null when the row is missing (migration not applied yet) or has no readable
 * password; the card then says so instead of crashing.
 */
export async function getClassroomCredentials(): Promise<ClassroomCredentials | null> {
  const session = await requireTeacher()
  const row = await db.user.findFirst({
    where: { role: 'CLASSROOM', city: session.user.city, deletedAt: null },
    select: { username: true, plainPassword: true },
  })
  if (!row?.username || !row.plainPassword) return null
  return { username: row.username, password: row.plainPassword }
}
