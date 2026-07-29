import type { PrismaClient } from '@prisma/client'

import type { DbSnapshot } from './plan'

/** The import is Split-only: both workbook years predate the Šibenik tenant. */
const IMPORT_CITY = 'SPLIT' as const

/**
 * Reads everything the planner needs from the target DB. Throws when the
 * Velebitska venue is missing — groups cannot be created without it.
 */
export async function loadSnapshot(db: PrismaClient, schoolYear: string): Promise<DbSnapshot> {
  const location = await db.location.findFirst({
    where: { city: IMPORT_CITY, name: { contains: 'Velebitska', mode: 'insensitive' } },
    select: { id: true, name: true },
  })
  if (!location) {
    throw new Error(
      'No SPLIT location matching "Velebitska" found — create the venue first (Admin → Lokacije).',
    )
  }

  const [courses, groups, staff, students, users] = await Promise.all([
    db.course.findMany({
      where: { kind: 'STANDARD' },
      select: { id: true, slug: true },
    }),
    db.scheduledGroup.findMany({
      where: { schoolYear, city: IMPORT_CITY },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { city: IMPORT_CITY, role: { in: ['TEACHER', 'ADMIN'] }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.user.findMany({
      where: { city: IMPORT_CITY, role: 'STUDENT', deletedAt: null },
      select: { id: true, firstName: true, lastName: true, parentEmail: true },
    }),
    db.user.findMany({ select: { username: true, email: true } }),
  ])

  return {
    schoolYear,
    location,
    courses,
    groups,
    staff,
    students,
    usernames: users.flatMap((u) => (u.username ? [u.username] : [])),
    emails: users.map((u) => u.email),
  }
}
