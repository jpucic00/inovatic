/**
 * seed-articles.ts — articles-only, NON-DESTRUCTIVE seeder.
 *
 * Unlike `prisma/seed.ts` (which wipes and rebuilds the ENTIRE database before
 * recreating everything), this refreshes ONLY the news articles plus their
 * tags and gallery images, by upserting each article by slug. Users, courses,
 * locations, enrollments — everything else — are left completely untouched, so
 * it is safe to run against a live/production database.
 *
 *   npm run db:seed:articles
 *
 * DB URLs come from .env.local / .env (loaded by ./seed); to target another
 * database (e.g. production), pass DATABASE_URL/DIRECT_URL inline — explicitly
 * set env vars win over dotenv.
 */
import { ARTICLE_AUTHOR_EMAIL, prisma, seedArticles } from './seed'

async function main() {
  console.log('🌱 Seeding articles only (non-destructive)...')

  // Author that owns the seeded articles. Looked up, never created: a missing
  // account must stop the run rather than mint an admin with a known password.
  const author = await prisma.user.findUnique({
    where: { email: ARTICLE_AUTHOR_EMAIL },
    select: { id: true },
  })
  if (!author) throw new Error(`Article author ${ARTICLE_AUTHOR_EMAIL} not found`)

  // Tags referenced by the articles — upsert by unique slug; any other tags
  // already in the DB are left alone.
  const [natjecanja, radionice, rezultati, obavijesti, euProjekt] = await Promise.all([
    prisma.tag.upsert({ where: { slug: 'natjecanja' }, update: {}, create: { name: 'Natjecanja', slug: 'natjecanja' } }),
    prisma.tag.upsert({ where: { slug: 'radionice' }, update: {}, create: { name: 'Radionice', slug: 'radionice' } }),
    prisma.tag.upsert({ where: { slug: 'rezultati' }, update: {}, create: { name: 'Rezultati', slug: 'rezultati' } }),
    prisma.tag.upsert({ where: { slug: 'obavijesti' }, update: {}, create: { name: 'Obavijesti', slug: 'obavijesti' } }),
    prisma.tag.upsert({ where: { slug: 'eu-projekt' }, update: {}, create: { name: 'EU Projekt', slug: 'eu-projekt' } }),
  ])

  await seedArticles({
    authorId: author.id,
    tags: { natjecanja, radionice, rezultati, obavijesti, euProjekt },
  })

  console.log('✅ Articles seeded. Users, courses, enrollments and everything else were left untouched.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
