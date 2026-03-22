/**
 * remove-galerija-text.ts
 *
 * Finds all articles whose BlockNote JSON content contains "Galerija fotografija:"
 * and removes those blocks (or the text within them).
 *
 * Usage:
 *   DIRECT_URL="..." DATABASE_URL="..." npx tsx scripts/remove-galerija-text.ts
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

type Block = {
  type: string
  content?: Array<{ type: string; text?: string }>
  children?: Block[]
  [key: string]: unknown
}

function containsGalerija(block: Block): boolean {
  if (block.content) {
    for (const inline of block.content) {
      if (inline.text && inline.text.includes('Galerija fotografija:')) {
        return true
      }
    }
  }
  return false
}

function removeGalerijaText(block: Block): Block {
  if (!block.content) return block
  const newContent = block.content
    .map((inline) => {
      if (inline.type === 'text' && inline.text) {
        return { ...inline, text: inline.text.replace(/Galerija fotografija:\s*/g, '').trimStart() }
      }
      return inline
    })
    .filter((inline) => inline.text !== '')
  return { ...block, content: newContent }
}

async function main() {
  const articles = await db.article.findMany({
    select: { id: true, slug: true, content: true },
  })

  let updated = 0

  for (const article of articles) {
    const blocks = article.content as Block[]
    if (!Array.isArray(blocks)) continue

    const hasGalerija = blocks.some(containsGalerija)
    if (!hasGalerija) continue

    const newBlocks = blocks
      .map((block) => (containsGalerija(block) ? removeGalerijaText(block) : block))
      // Remove blocks that are now empty (no text content left)
      .filter((block) => {
        if (!block.content) return true
        const text = block.content.map((i) => i.text ?? '').join('').trim()
        return text !== ''
      })

    await db.article.update({
      where: { id: article.id },
      data: { content: newBlocks as object[] },
    })

    console.log(`✓ Fixed: ${article.slug}`)
    updated++
  }

  console.log(`\nDone. Updated ${updated} article(s).`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
