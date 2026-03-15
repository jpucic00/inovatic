/**
 * download-wp-images.ts
 *
 * Scrapes article pages from the current WordPress site, downloads all
 * gallery images to public/images/articles/{slug}/, and copies the first
 * image as the cover (public/images/articles/{slug}.jpg).
 *
 * Usage:
 *   npm run download-wp-images
 *
 * After running, seed the DB with:
 *   npm run db:seed-images
 */

import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'articles')

// Map of new article slug → WordPress article URL
const ARTICLES: { slug: string; wpUrl: string }[] = [
  {
    slug: 'regionalno-fll-2026',
    wpUrl: 'https://udruga-inovatic.hr/regionalno-fll-2026/',
  },
  {
    slug: 'science-comes-to-town',
    wpUrl: 'https://udruga-inovatic.hr/science-comes-to-town/',
  },
  {
    slug: 'odrzane-zimske-radionice-robotike-2026',
    wpUrl: 'https://udruga-inovatic.hr/odrzane-zimske-radionice-robotike-2026/',
  },
  {
    slug: 'splitska-udruga-inovatic-osvoji-srebro-na-svjetskom-finalu-robotike-u-singapuru',
    wpUrl: 'https://udruga-inovatic.hr/splitska-udruga-inovatic-osvojila-srebro-na-svjetskom-finalu-robotike-u-singapuru/',
  },
  {
    slug: 'zimske-radionice-2026',
    wpUrl: 'https://udruga-inovatic.hr/zimske-radionice-2026/',
  },
  {
    slug: 'donacija-singapur',
    wpUrl: 'https://udruga-inovatic.hr/donacija-singapur/',
  },
]

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchHtml(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)) })
  })
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Strip query params for the download URL but keep original path
    const cleanUrl = url.split('?')[0]
    const client = cleanUrl.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)
    const req = client.get(cleanUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    })
    req.on('error', (err) => { file.close(); fs.existsSync(dest) && fs.unlinkSync(dest); reject(err) })
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

function extractGalleryImageUrls(html: string): string[] {
  // Match full-size images from wp-content/uploads/photo-gallery/
  // Exclude /thumb/ subfolders
  const regex = /https?:\/\/udruga-inovatic\.hr\/wp-content\/uploads\/photo-gallery\/[^"'\s?]+\.(?:jpg|jpeg|png|webp)/gi
  const matches = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const url = m[0]
    if (!url.includes('/thumb/')) {
      matches.add(url)
    }
  }
  // Sort numerically where possible (1.jpg, 2.jpg, … before 10.jpg)
  return [...matches].sort((a, b) => {
    const nameA = path.basename(a, path.extname(a))
    const nameB = path.basename(b, path.extname(b))
    const numA = parseInt(nameA)
    const numB = parseInt(nameB)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return nameA.localeCompare(nameB)
  })
}

async function processArticle(slug: string, wpUrl: string) {
  console.log(`\n📄 ${slug}`)
  console.log(`   Fetching: ${wpUrl}`)

  let html: string
  try {
    html = await fetchHtml(wpUrl)
  } catch (err) {
    console.log(`   ⚠️  Could not fetch page: ${(err as Error).message}`)
    return
  }

  const imageUrls = extractGalleryImageUrls(html)
  if (imageUrls.length === 0) {
    console.log(`   ℹ️  No gallery images found on page`)
    return
  }

  console.log(`   Found ${imageUrls.length} gallery image(s)`)

  // Ensure gallery folder exists
  const galleryDir = path.join(IMAGES_DIR, slug)
  fs.mkdirSync(galleryDir, { recursive: true })

  let downloaded = 0
  let skipped = 0

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]
    const ext = path.extname(url.split('?')[0]) || '.jpg'
    // Pad index for alphabetical sort: 01.jpg, 02.jpg, ...
    const filename = String(i + 1).padStart(2, '0') + ext
    const dest = path.join(galleryDir, filename)

    if (fs.existsSync(dest)) {
      skipped++
      continue
    }

    try {
      await downloadFile(url, dest)
      process.stdout.write('.')
      downloaded++
    } catch (err) {
      console.log(`\n   ⚠️  Failed to download ${url}: ${(err as Error).message}`)
    }
  }

  if (downloaded > 0) process.stdout.write('\n')
  console.log(`   ✅ Downloaded: ${downloaded}, skipped (already exist): ${skipped}`)

  // Use first image as cover (copy to public/images/articles/{slug}.jpg)
  const firstImageFiles = fs.readdirSync(galleryDir).filter((f) =>
    ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase())
  ).sort()

  if (firstImageFiles.length > 0) {
    const coverExt = path.extname(firstImageFiles[0])
    const coverDest = path.join(IMAGES_DIR, `${slug}${coverExt}`)
    if (!fs.existsSync(coverDest)) {
      fs.copyFileSync(path.join(galleryDir, firstImageFiles[0]), coverDest)
      console.log(`   📸 Cover image set: ${slug}${coverExt}`)
    } else {
      console.log(`   📸 Cover already exists, skipping`)
    }
  }
}

async function main() {
  console.log('🌐 Downloading images from udruga-inovatic.hr...')
  console.log(`   Destination: ${IMAGES_DIR}\n`)

  fs.mkdirSync(IMAGES_DIR, { recursive: true })

  for (const { slug, wpUrl } of ARTICLES) {
    await processArticle(slug, wpUrl)
  }

  console.log('\n✅ Done! Now run:')
  console.log('   npm run db:seed-images')
  console.log('   (This updates the database with the downloaded image paths)')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
