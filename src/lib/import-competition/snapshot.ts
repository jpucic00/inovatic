import type { City, PrismaClient } from '@prisma/client'

import { seasonMonths } from '../monthly-charges'
import type { CompetitionSnapshot } from './plan'

const COMPETITION_COURSE_SLUG = 'natjecateljski-program'

/**
 * Reads everything the planner needs from the target DB. Throws when the venue
 * or the competition course is missing — neither can be invented here.
 */
export async function loadCompetitionSnapshot(
  db: PrismaClient,
  schoolYear: string,
  city: City,
): Promise<CompetitionSnapshot> {
  const location = await db.location.findFirst({
    where: { city, name: { contains: 'Velebitska', mode: 'insensitive' } },
    select: { id: true, name: true },
  })
  if (!location) {
    throw new Error(
      `No ${city} location matching "Velebitska" found — create the venue first (Admin → Lokacije).`,
    )
  }

  const course = await db.course.findUnique({
    where: { slug: COMPETITION_COURSE_SLUG },
    select: { id: true },
  })
  if (!course) {
    throw new Error(
      `Course "${COMPETITION_COURSE_SLUG}" is not in this database — run \`npm run db:seed:competition\` first.`,
    )
  }

  const [season, courses, groups, staff, students, users] = await Promise.all([
    db.courseSeason.findUnique({
      where: { courseId_schoolYear_city: { courseId: course.id, schoolYear, city } },
      select: { startDate: true, endDate: true },
    }),
    // Standard SLR courses only — a COURSE preporuka may never point at a
    // radionica or at the competitive program itself.
    db.course.findMany({
      where: { kind: 'STANDARD', level: { not: null } },
      select: { id: true, slug: true },
    }),
    db.scheduledGroup.findMany({
      where: { schoolYear, city, courseId: course.id },
      select: { id: true, name: true, dayOfWeek: true, startTime: true },
    }),
    db.user.findMany({
      where: { city, role: { in: ['TEACHER', 'ADMIN'] }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.user.findMany({
      where: { city, role: 'STUDENT', deletedAt: null },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
    }),
    db.user.findMany({ select: { username: true, email: true } }),
  ])

  return {
    schoolYear,
    city,
    location,
    competitionCourseId: course.id,
    // No `from` floor: a historical year is billed across its whole season, not
    // from today. Every one of these months is written already paid.
    seasonMonths: seasonMonths(season?.startDate ?? null, season?.endDate ?? null),
    season: season ?? null,
    courses,
    groups,
    staff,
    students,
    usernames: users.flatMap((u) => (u.username ? [u.username] : [])),
    emails: users.map((u) => u.email),
  }
}
