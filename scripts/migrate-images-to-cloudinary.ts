/**
 * migrate-images-to-cloudinary.ts
 *
 * Uploads all local article images to Cloudinary, updates the database,
 * and patches prisma/seed.ts with Cloudinary URLs.
 *
 * Folder structure expected in public/images/articles/:
 *   {slug}.jpg                      ← cover image
 *   {slug}/                         ← gallery images
 *     01.jpg
 *   {slug}/inline/                  ← inline images in article content
 *     photo.jpg
 *     video.mp4
 *
 * Cloudinary layout:
 *   articles/covers/{slug}
 *   articles/gallery/{slug}/{name}
 *   articles/inline/{slug}/{name}
 *
 * Usage:
 *   npx tsx scripts/migrate-images-to-cloudinary.ts
 *   (requires CLOUDINARY_* and DATABASE_URL in .env or .env.local)
 *
 * Saves mapping to cloudinary-mapping.json (gitignored).
 * Re-running is safe: Cloudinary overwrite: true, DB updates are idempotent.
 */

import { v2 as cloudinary } from 'cloudinary'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'

// Load env (try .env.local first, fallback to .env)
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const prisma = new PrismaClient()

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'articles')
const MAPPING_FILE = path.join(process.cwd(), 'cloudinary-mapping.json')
const SEED_FILE = path.join(process.cwd(), 'prisma', 'seed.ts')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])

type Mapping = Record<string, string> // local URL path → Cloudinary URL

function isImage(file: string) {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase())
}

function isVideo(file: string) {
  return VIDEO_EXTS.has(path.extname(file).toLowerCase())
}

async function uploadFile(
  localPath: string,
  publicId: string,
  folder: string,
  resourceType: 'image' | 'video' | 'raw',
): Promise<string> {
  const result = await cloudinary.uploader.upload(localPath, {
    folder,
    public_id: path.basename(publicId, path.extname(publicId)),
    resource_type: resourceType,
    overwrite: true,
  })
  return result.secure_url
}

async function migrateCoverImages(mapping: Mapping) {
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => fs.statSync(path.join(IMAGES_DIR, f)).isFile() && (isImage(f) || isVideo(f)))

  console.log(`\n📸 Covers: ${files.length} found`)

  for (const file of files) {
    const localFilePath = path.join(IMAGES_DIR, file)
    const localUrlPath = `/images/articles/${file}`
    const slug = path.basename(file, path.extname(file))

    if (mapping[localUrlPath]) {
      console.log(`  ↳ skip (already mapped): ${file}`)
      continue
    }

    try {
      const url = await uploadFile(localFilePath, slug, 'articles/covers', 'image')
      mapping[localUrlPath] = url
      console.log(`  ✅ ${file} → ${url}`)
    } catch (err) {
      console.error(`  ❌ ${file}:`, (err as Error).message)
    }
  }
}

async function uploadBatch(
  tasks: Array<{ localFilePath: string; localUrlPath: string; label: string; publicId: string; folder: string; resourceType: 'image' | 'video' }>,
  mapping: Mapping,
  concurrency = 5,
) {
  let done = 0
  const total = tasks.filter((t) => !mapping[t.localUrlPath]).length
  const queue = tasks.filter((t) => !mapping[t.localUrlPath])

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift()!
      try {
        const url = await uploadFile(task.localFilePath, task.publicId, task.folder, task.resourceType)
        mapping[task.localUrlPath] = url
        done++
        process.stdout.write(`\r  ${done}/${total} uploaded...`)
      } catch (err) {
        console.error(`\n  ❌ ${task.label}:`, (err as Error).message)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  if (total > 0) process.stdout.write('\n')
}

async function migrateGalleryImages(mapping: Mapping) {
  const slugDirs = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => fs.statSync(path.join(IMAGES_DIR, f)).isDirectory())

  const tasks = []
  for (const slug of slugDirs) {
    const slugDir = path.join(IMAGES_DIR, slug)
    const files = fs
      .readdirSync(slugDir)
      .filter((f) => fs.statSync(path.join(slugDir, f)).isFile() && (isImage(f) || isVideo(f)))
      .sort()

    for (const file of files) {
      tasks.push({
        localFilePath: path.join(slugDir, file),
        localUrlPath: `/images/articles/${slug}/${file}`,
        label: `gallery ${slug}/${file}`,
        publicId: path.basename(file, path.extname(file)),
        folder: `articles/gallery/${slug}`,
        resourceType: (isVideo(file) ? 'video' : 'image') as 'image' | 'video',
      })
    }
  }

  const skipped = tasks.filter((t) => mapping[t.localUrlPath]).length
  console.log(`\n🖼️  Gallery: ${tasks.length} files (${skipped} already uploaded, ${tasks.length - skipped} to upload)`)
  await uploadBatch(tasks, mapping)
}

async function migrateInlineImages(mapping: Mapping) {
  const slugDirs = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => fs.statSync(path.join(IMAGES_DIR, f)).isDirectory())

  const tasks = []
  for (const slug of slugDirs) {
    const inlineDir = path.join(IMAGES_DIR, slug, 'inline')
    if (!fs.existsSync(inlineDir)) continue

    const files = fs
      .readdirSync(inlineDir)
      .filter((f) => fs.statSync(path.join(inlineDir, f)).isFile() && (isImage(f) || isVideo(f)))
      .sort()

    for (const file of files) {
      tasks.push({
        localFilePath: path.join(inlineDir, file),
        localUrlPath: `/images/articles/${slug}/inline/${file}`,
        label: `inline ${slug}/inline/${file}`,
        publicId: path.basename(file, path.extname(file)),
        folder: `articles/inline/${slug}`,
        resourceType: (isVideo(file) ? 'video' : 'image') as 'image' | 'video',
      })
    }
  }

  const skipped = tasks.filter((t) => mapping[t.localUrlPath]).length
  console.log(`\n📎 Inline: ${tasks.length} files (${skipped} already uploaded, ${tasks.length - skipped} to upload)`)
  await uploadBatch(tasks, mapping)
}

async function updateDatabase(mapping: Mapping) {
  console.log('\n💾 Updating database...')

  // --- Cover images ---
  let coverCount = 0
  for (const [localUrl, cloudUrl] of Object.entries(mapping)) {
    // Covers look like /images/articles/{slug}.jpg (no subpath)
    const parts = localUrl.replace('/images/articles/', '').split('/')
    if (parts.length !== 1) continue

    const slug = path.basename(parts[0], path.extname(parts[0]))
    const updated = await prisma.article.updateMany({
      where: { slug },
      data: { coverImage: cloudUrl },
    })
    if (updated.count > 0) coverCount++
  }
  console.log(`  ✅ ${coverCount} article cover images updated`)

  // --- Gallery images ---
  let galleryCount = 0
  for (const [localUrl, cloudUrl] of Object.entries(mapping)) {
    const withoutPrefix = localUrl.replace('/images/articles/', '')
    const parts = withoutPrefix.split('/')
    // Gallery: {slug}/{file} (2 parts, not inline)
    if (parts.length !== 2) continue

    const updated = await prisma.articleImage.updateMany({
      where: { url: localUrl },
      data: { url: cloudUrl },
    })
    galleryCount += updated.count
  }
  console.log(`  ✅ ${galleryCount} gallery image records updated`)

  // --- Inline images in Article.content (BlockNote JSON) ---
  const articles = await prisma.article.findMany({
    select: { id: true, slug: true, content: true },
  })

  let inlineArticleCount = 0
  for (const article of articles) {
    const originalJson = JSON.stringify(article.content)
    let updatedJson = originalJson

    for (const [localUrl, cloudUrl] of Object.entries(mapping)) {
      // Only inline paths
      if (!localUrl.includes('/inline/')) continue
      updatedJson = updatedJson.split(localUrl).join(cloudUrl)
    }

    if (updatedJson !== originalJson) {
      await prisma.article.update({
        where: { id: article.id },
        data: { content: JSON.parse(updatedJson) },
      })
      inlineArticleCount++
    }
  }
  console.log(`  ✅ ${inlineArticleCount} article content blocks updated (inline images)`)
}

function patchSeedFile(mapping: Mapping) {
  if (!fs.existsSync(SEED_FILE)) {
    console.log('\n⚠️  seed.ts not found, skipping')
    return
  }

  let content = fs.readFileSync(SEED_FILE, 'utf-8')
  let replacements = 0

  // Replace inline image/video URLs
  for (const [localUrl, cloudUrl] of Object.entries(mapping)) {
    if (!localUrl.includes('/inline/')) continue
    const escaped = localUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'g')
    const before = content
    content = content.replace(regex, cloudUrl)
    if (content !== before) replacements++
  }

  // Replace coverImage: null with coverImage: '<url>' for articles that have covers
  for (const [localUrl, cloudUrl] of Object.entries(mapping)) {
    const withoutPrefix = localUrl.replace('/images/articles/', '')
    const parts = withoutPrefix.split('/')
    if (parts.length !== 1) continue // only covers

    const slug = path.basename(parts[0], path.extname(parts[0]))
    // Find the article block by slug, then replace its coverImage: null
    const slugPattern = new RegExp(
      `(slug:\\s*'${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]{0,4000}?coverImage:\\s*)null`,
    )
    const before = content
    content = content.replace(slugPattern, `$1'${cloudUrl}'`)
    if (content !== before) replacements++
  }

  fs.writeFileSync(SEED_FILE, content, 'utf-8')
  console.log(`\n📝 seed.ts patched: ${replacements} replacements`)
}

async function main() {
  console.log('🚀 Cloudinary image migration\n')

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('❌ Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET')
    process.exit(1)
  }

  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ Images directory not found: ${IMAGES_DIR}`)
    console.error('   Run `npm run download-wp-images` first to download article images.')
    process.exit(1)
  }

  // Load existing mapping (so re-runs skip already-uploaded files)
  const mapping: Mapping = fs.existsSync(MAPPING_FILE)
    ? JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    : {}

  const save = () => fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2))

  await migrateCoverImages(mapping)
  save()
  await migrateGalleryImages(mapping)
  save()
  await migrateInlineImages(mapping)
  save()

  console.log(`\n💾 Mapping saved: ${MAPPING_FILE} (${Object.keys(mapping).length} entries)`)

  await updateDatabase(mapping)
  patchSeedFile(mapping)

  const total = Object.keys(mapping).length
  console.log(`\n✅ Done! ${total} files migrated to Cloudinary.`)
  console.log('   Next: commit the updated seed.ts and deploy.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
