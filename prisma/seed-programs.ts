/**
 * seed-programs.ts — the standard SLR catalog only, NON-DESTRUCTIVE.
 *
 * Unlike `prisma/seed.ts` (which wipes and rebuilds the ENTIRE database), this
 * upserts the standard programs by slug and their modules by title. Users,
 * groups, enrollments, materials — everything else — are left untouched, so it
 * is safe to run against a live/production database to introduce a new program
 * or to push a copy/age correction after `courses-data.ts` changes.
 *
 *   npm run db:seed:programs
 *
 * It deliberately does NOT create enrollment windows or groups: both are
 * per-city, per-year decisions the admin makes on `/admin/programi/[courseId]`.
 * Until a window exists the new program simply has no bookable termini — the
 * correct state for a program nobody has planned yet.
 *
 * Existing enrollments are never moved. Splitting predškolci out of SLR 1 is
 * additive: children already sitting in an SLR 1 group stay there for the year
 * they signed up for.
 *
 * DB URLs come from .env.local / .env (loaded by ./seed); to target another
 * database (e.g. production), pass DATABASE_URL/DIRECT_URL inline — explicitly
 * set env vars win over dotenv.
 */
import { prisma, seedStandardPrograms } from './seed'

async function main() {
  console.log('🌱 Seeding the standard programs only (non-destructive)...')
  const courses = await seedStandardPrograms()

  const rows = await prisma.course.findMany({
    where: { id: { in: courses.map((c) => c.id) } },
    select: { slug: true, title: true, ageMin: true, ageMax: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  })
  console.table(rows)

  console.log('')
  console.log('Next steps in /admin/programi for any newly introduced program:')
  console.log('  1. Open the signup window for this school year and city.')
  console.log('  2. Plan the module dates for the school year.')
  console.log('  3. Create the groups (weekday + time) and assign a teacher.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
