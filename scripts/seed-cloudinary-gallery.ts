/**
 * seed-cloudinary-gallery.ts
 *
 * Seeds article cover images and ArticleImage gallery records from cloudinary-mapping.json.
 * Use this instead of seed-article-images.ts when local image files are not available
 * (e.g. seeding production database after Cloudinary migration).
 *
 * Usage (against production via Railway):
 *   railway run npx tsx scripts/seed-cloudinary-gallery.ts
 *
 * Usage (against local DB with Neon URLs in .env.local):
 *   npx tsx scripts/seed-cloudinary-gallery.ts
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const MAPPING_FILE = path.join(process.cwd(), 'cloudinary-mapping.json')

async function seedCovers(mapping: Record<string, string>) {
  // Cover entries: /images/articles/{slug}.ext (depth 3)
  const coverEntries = Object.entries(mapping).filter(([localPath]) => {
    const parts = localPath.split('/').filter(Boolean)
    return parts.length === 3 && parts[0] === 'images' && parts[1] === 'articles'
  })

  console.log(`Found ${coverEntries.length} cover images in mapping`)

  let updated = 0
  let skipped = 0

  for (const [localPath, cloudinaryUrl] of coverEntries) {
    const filename = localPath.split('/').pop()!
    const slug = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename

    const article = await prisma.article.findUnique({ where: { slug } })
    if (!article) {
      skipped++
      continue
    }

    await prisma.article.update({ where: { slug }, data: { coverImage: cloudinaryUrl } })
    updated++
  }

  console.log(`  Covers: ${updated} updated, ${skipped} unmatched\n`)
}

async function seedGallery(mapping: Record<string, string>) {
  // Gallery entries: /images/articles/{slug}/{file} (depth 4, no "inline" segment)
  const galleryEntries = Object.entries(mapping).filter(([localPath]) => {
    const parts = localPath.split('/').filter(Boolean)
    return parts.length === 4 && parts[0] === 'images' && parts[1] === 'articles' && parts[3] !== 'inline'
  })

  // Group by slug
  const bySlug: Record<string, Array<{ file: string; url: string }>> = {}
  for (const [localPath, cloudinaryUrl] of galleryEntries) {
    const parts = localPath.split('/').filter(Boolean)
    const slug = parts[2]
    const file = parts[3]
    if (!bySlug[slug]) bySlug[slug] = []
    bySlug[slug].push({ file, url: cloudinaryUrl })
  }

  const slugs = Object.keys(bySlug).sort()
  console.log(`Found gallery images for ${slugs.length} articles`)

  let totalAdded = 0
  let notFound = 0

  for (const slug of slugs) {
    const article = await prisma.article.findUnique({ where: { slug } })
    if (!article) {
      console.log(`  SKIP (no article): ${slug}`)
      notFound++
      continue
    }

    const images = bySlug[slug].sort((a, b) => a.file.localeCompare(b.file))

    try {
      await prisma.articleImage.deleteMany({ where: { articleId: article.id } })
      await prisma.articleImage.createMany({
        data: images.map((img, index) => ({
          articleId: article.id,
          url: img.url,
          caption: null,
          sortOrder: index,
        })),
        skipDuplicates: true,
      })
      console.log(`  OK: ${slug} (${images.length} images)`)
      totalAdded += images.length
    } catch (err) {
      console.error(`  ERROR: ${slug} — ${err}`)
    }
  }

  console.log(`  Gallery: ${totalAdded} images seeded across ${slugs.length - notFound} articles, ${notFound} slugs unmatched`)
}

async function main() {
  if (!fs.existsSync(MAPPING_FILE)) {
    console.error('cloudinary-mapping.json not found at:', MAPPING_FILE)
    process.exit(1)
  }

  const mapping: Record<string, string> = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
  console.log(`Loaded ${Object.keys(mapping).length} entries from cloudinary-mapping.json\n`)

  await seedCovers(mapping)
  await seedGallery(mapping)

  console.log('\nDone!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
