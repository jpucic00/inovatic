/**
 * seed-competition-program.ts — the Natjecateljski program only, NON-DESTRUCTIVE.
 *
 * Unlike `prisma/seed.ts` (which wipes and rebuilds the ENTIRE database), this
 * upserts one course by slug and its natjecanja by title. Users, groups,
 * enrollments — everything else — are left untouched, so it is safe to run
 * against a live/production database to introduce the program or to refresh its
 * natjecanja after `competitions-data.ts` changes.
 *
 *   npm run db:seed:competition
 *
 * It deliberately does NOT create an enrollment window or a season: both are
 * per-city, per-year decisions the admin makes on `/admin/programi/[courseId]`.
 * Until they exist the program simply has no bookable termini — which is the
 * correct state for a program nobody has planned yet.
 *
 * DB URLs come from .env.local / .env (loaded by ./seed); to target another
 * database (e.g. production), pass DATABASE_URL/DIRECT_URL inline — explicitly
 * set env vars win over dotenv.
 */
import { prisma, seedCompetitionProgram } from './seed'

async function main() {
  console.log('🌱 Seeding the Natjecateljski program only (non-destructive)...')
  const course = await seedCompetitionProgram()
  console.log(`   Course id: ${course.id}`)
  console.log('')
  console.log('Next steps in /admin/programi:')
  console.log('  1. Set "Trajanje programa" for this school year and city.')
  console.log('  2. Open the signup window so the invitation link accepts prijave.')
  console.log('  3. Create the groups (weekday + time), naming each for its natjecanje.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
