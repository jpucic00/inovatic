/**
 * seed-article-images.ts
 *
 * 1. Scans public/images/articles/ for cover images (filename = slug)
 *    and updates the coverImage field in the DB.
 *
 * 2. Scans public/images/articles/{slug}/ subfolders for gallery images
 *    and upserts ArticleImage records (sorted by filename).
 *
 * Usage:
 *   npm run db:seed-images
 *
 * Supported extensions: .jpg, .jpeg, .png, .webp, .avif
 *
 * Folder structure:
 *   public/images/articles/
 *     wro-srebro-singapore-2025.jpg          ← cover image
 *     wro-srebro-singapore-2025/             ← gallery folder
 *       01.jpg
 *       02.jpg
 *       team.jpg
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'articles')
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif']

function isImage(filename: string) {
  return SUPPORTED_EXTENSIONS.includes(path.extname(filename).toLowerCase())
}

async function seedCoverImages() {
  const files = fs.readdirSync(IMAGES_DIR).filter((f) => {
    const fullPath = path.join(IMAGES_DIR, f)
    return fs.statSync(fullPath).isFile() && isImage(f)
  })

  if (files.length === 0) {
    console.log('ℹ️  No cover image files found.')
  }

  let updated = 0
  let notFound = 0

  for (const file of files) {
    const slug = path.basename(file, path.extname(file))
    const imageUrl = `/images/articles/${file}`
    const article = await prisma.article.findUnique({ where: { slug } })

    if (!article) {
      console.log(`⚠️  Cover: no article for slug "${slug}" (${file})`)
      notFound++
      continue
    }

    await prisma.article.update({ where: { slug }, data: { coverImage: imageUrl } })
    console.log(`✅ Cover updated: ${slug}`)
    updated++
  }

  console.log(`   Covers: ${updated} updated, ${notFound} unmatched\n`)
}

async function seedGalleryImages() {
  const entries = fs.readdirSync(IMAGES_DIR).filter((f) => {
    return fs.statSync(path.join(IMAGES_DIR, f)).isDirectory()
  })

  if (entries.length === 0) {
    console.log('ℹ️  No gallery subfolders found.')
    return
  }

  let totalAdded = 0

  for (const slug of entries) {
    const article = await prisma.article.findUnique({ where: { slug } })

    if (!article) {
      console.log(`⚠️  Gallery: no article for slug "${slug}"`)
      continue
    }

    const folder = path.join(IMAGES_DIR, slug)
    const imageFiles = fs.readdirSync(folder)
      .filter(isImage)
      .sort()

    if (imageFiles.length === 0) {
      console.log(`ℹ️  Gallery folder "${slug}" is empty`)
      continue
    }

    // Clear existing gallery images and re-insert (clean re-seed)
    await prisma.articleImage.deleteMany({ where: { articleId: article.id } })

    const records = imageFiles.map((file, index) => ({
      articleId: article.id,
      url: `/images/articles/${slug}/${file}`,
      caption: null,
      sortOrder: index,
    }))

    await prisma.articleImage.createMany({ data: records })
    console.log(`✅ Gallery updated: ${slug} (${records.length} image${records.length !== 1 ? 's' : ''})`)
    totalAdded += records.length
  }

  console.log(`   Gallery: ${totalAdded} image(s) seeded across ${entries.length} article(s)`)
}

async function main() {
  console.log('📸 Seeding article images...')
  console.log(`   Directory: ${IMAGES_DIR}\n`)

  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('❌ Images directory not found:', IMAGES_DIR)
    process.exit(1)
  }

  await seedCoverImages()
  await seedGalleryImages()

  console.log('\nDone!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
