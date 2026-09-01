/**
 * watermark-existing-urls.ts — put the Inovatic watermark on images that were
 * already uploaded before the feature existed.
 *
 *   npm run db:watermark-images                      # dry run, prints what would change
 *   npm run db:watermark-images -- --apply
 *   npm run db:watermark-images -- --revert          # dry run of the removal
 *   npm run db:watermark-images -- --revert --apply
 *
 * WHAT IT TOUCHES. Only strings. The watermark is a Cloudinary delivery
 * overlay spliced into the URL, so the assets themselves are never re-uploaded,
 * re-encoded or replaced — `--revert` gives the original photos back by
 * deleting a path segment. That is the whole reason the feature was built this
 * way rather than burning the logo into the pixels.
 *
 * WHY A SCRIPT AND NOT A MIGRATION. All four rewrites are expressible in SQL,
 * including the JSON one, but a data change over live article content deserves
 * a look before it lands. Dry run first, read the report, then `--apply`.
 *
 * HOW IT IS RUN AGAINST PRODUCTION. Locally, with Railway injecting the
 * service's variables:
 *
 *   railway run npm run db:watermark-images
 *   railway run npm run db:watermark-images -- --apply
 *
 * It cannot be executed inside the Railway container: the production image is a
 * Next standalone build and ships neither `scripts/` nor `tsx`. See
 * docs/runbooks/watermark-images.md.
 *
 * IMAGES ONLY. Article bodies also carry `video/upload` URLs; `withWatermark`
 * refuses anything that is not an image, and the BlockNote walk skips video
 * blocks outright.
 *
 * SAFE TO RE-RUN. `withWatermark` and `stripWatermark` are both no-ops on a URL
 * that is already in the target state, so a second run reports zero changes.
 * Note it will not RE-TUNE an existing watermark: changing the transformation
 * means `--revert --apply` followed by `--apply`.
 */
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { db } from '../src/lib/db'
import { mapImageUrls } from '../src/lib/blocknote-images'
import { stripWatermark, withWatermark } from '../src/lib/cloudinary-url'

const apply = process.argv.includes('--apply')
const revert = process.argv.includes('--revert')

/** The rewrite this run performs. */
const rewrite = revert ? stripWatermark : withWatermark
const verb = revert ? 'remove' : 'add'

interface Tally {
  scanned: number
  changed: number
}

const tallies = new Map<string, Tally>()

function record(label: string, scanned: number, changed: number): void {
  tallies.set(label, { scanned, changed })
}

/** Print at most a handful of before/after pairs, so a dry run stays readable. */
const SAMPLE_LIMIT = 3
const samples: string[] = []

function sample(before: string, after: string): void {
  if (samples.length >= SAMPLE_LIMIT) return
  samples.push(`    - ${before}\n    + ${after}`)
}

async function articleCovers(): Promise<void> {
  const rows = await db.article.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, coverImage: true },
  })

  let changed = 0
  for (const row of rows) {
    const before = row.coverImage!
    const after = rewrite(before)
    if (after === before) continue
    changed++
    sample(before, after)
    if (apply) {
      await db.article.update({ where: { id: row.id }, data: { coverImage: after } })
    }
  }
  record('Article.coverImage', rows.length, changed)
}

async function articleBodies(): Promise<void> {
  const rows = await db.article.findMany({ select: { id: true, content: true } })

  let changed = 0
  let blocks = 0
  for (const row of rows) {
    let touched = 0
    const next = mapImageUrls(row.content, (url) => {
      const after = rewrite(url)
      if (after !== url) {
        touched++
        sample(url, after)
      }
      return after
    })
    if (touched === 0) continue
    changed++
    blocks += touched
    if (apply) {
      await db.article.update({
        where: { id: row.id },
        data: { content: next as never },
      })
    }
  }
  record(`Article.content (${blocks} image block(s))`, rows.length, changed)
}

async function articleGalleries(): Promise<void> {
  const rows = await db.articleImage.findMany({ select: { id: true, url: true } })

  let changed = 0
  for (const row of rows) {
    const after = rewrite(row.url)
    if (after === row.url) continue
    changed++
    sample(row.url, after)
    if (apply) {
      await db.articleImage.update({ where: { id: row.id }, data: { url: after } })
    }
  }
  record('ArticleImage.url', rows.length, changed)
}

async function groupGalleries(): Promise<void> {
  const rows = await db.galleryImage.findMany({ select: { id: true, url: true } })

  let changed = 0
  for (const row of rows) {
    const after = rewrite(row.url)
    if (after === row.url) continue
    changed++
    sample(row.url, after)
    if (apply) {
      await db.galleryImage.update({ where: { id: row.id }, data: { url: after } })
    }
  }
  record('GalleryImage.url', rows.length, changed)
}

async function main(): Promise<void> {
  console.log(
    `\nWatermark backfill — would ${verb} the Inovatic overlay` +
      `${apply ? '' : ' (DRY RUN)'}\n`,
  )

  await articleCovers()
  await articleBodies()
  await articleGalleries()
  await groupGalleries()

  let total = 0
  for (const [label, { scanned, changed }] of tallies) {
    total += changed
    console.log(
      `  ${label.padEnd(34)} ${String(changed).padStart(5)} / ${scanned} row(s)`,
    )
  }

  if (samples.length > 0) {
    console.log(`\n  Sample rewrite(s):\n${samples.join('\n')}`)
  }

  console.log(
    `\n  ${total} URL(s) ${apply ? 'rewritten' : 'would be rewritten'}.\n` +
      (apply
        ? '  Done.\n'
        : `  Dry run — nothing written. Re-run with --apply to save.\n`),
  )
}

main()
  .catch((err: unknown) => {
    console.error('watermark-existing-urls failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
