'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { destroyCloudinaryAssets } from '@/lib/cloudinary-url'
import type { AdminActionResult } from '@/lib/action-types'

export type GalleryImage = {
  id: string
  url: string
  caption: string | null
  sortOrder: number
}

async function revalidateArticlePaths(articleId: string, slug: string | null) {
  revalidatePath(`/admin/novosti/${articleId}/uredi`)
  if (slug) revalidatePath(`/novosti/${slug}`)
}

/**
 * Append one or more images to an article's gallery. Each call assigns
 * `sortOrder` values continuing from the current tail so inserts preserve
 * existing ordering.
 */
export async function addGalleryImages(
  articleId: string,
  urls: string[],
): Promise<AdminActionResult & { images?: GalleryImage[] }> {
  await requireAdmin()
  if (!articleId || urls.length === 0) {
    return { success: false, error: 'Nedostaju podaci.' }
  }

  try {
    const article = await db.article.findUnique({
      where: { id: articleId },
      select: { slug: true, isPublished: true },
    })
    if (!article) return { success: false, error: 'Članak nije pronađen.' }

    const last = await db.articleImage.findFirst({
      where: { articleId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const startOrder = (last?.sortOrder ?? -1) + 1

    const created = await db.$transaction(
      urls.map((url, i) =>
        db.articleImage.create({
          data: {
            articleId,
            url,
            sortOrder: startOrder + i,
          },
          select: { id: true, url: true, caption: true, sortOrder: true },
        }),
      ),
    )

    await revalidateArticlePaths(articleId, article.isPublished ? article.slug : null)
    return { success: true, images: created }
  } catch (err) {
    console.error('addGalleryImages failed:', err)
    return { success: false, error: 'Greška pri dodavanju slika u galeriju.' }
  }
}

/** Remove a single gallery image and destroy its Cloudinary asset. */
export async function removeGalleryImage(
  imageId: string,
): Promise<AdminActionResult> {
  await requireAdmin()
  if (!imageId) return { success: false, error: 'Nedostaje ID.' }

  try {
    const image = await db.articleImage.findUnique({
      where: { id: imageId },
      select: {
        url: true,
        article: { select: { id: true, slug: true, isPublished: true } },
      },
    })
    if (!image) return { success: false, error: 'Slika nije pronađena.' }

    await db.articleImage.delete({ where: { id: imageId } })
    await destroyCloudinaryAssets([image.url])

    await revalidateArticlePaths(
      image.article.id,
      image.article.isPublished ? image.article.slug : null,
    )
    return { success: true }
  } catch (err) {
    console.error('removeGalleryImage failed:', err)
    return { success: false, error: 'Greška pri brisanju slike.' }
  }
}

/**
 * Move a gallery image one position up or down by swapping sortOrder with
 * the adjacent image.
 */
export async function reorderGalleryImage(
  imageId: string,
  direction: 'up' | 'down',
): Promise<AdminActionResult> {
  await requireAdmin()
  if (!imageId) return { success: false, error: 'Nedostaje ID.' }

  try {
    const current = await db.articleImage.findUnique({
      where: { id: imageId },
      select: {
        articleId: true,
        sortOrder: true,
        article: { select: { slug: true, isPublished: true } },
      },
    })
    if (!current) return { success: false, error: 'Slika nije pronađena.' }

    const neighbor = await db.articleImage.findFirst({
      where: {
        articleId: current.articleId,
        sortOrder:
          direction === 'up'
            ? { lt: current.sortOrder }
            : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
      select: { id: true, sortOrder: true },
    })
    if (!neighbor) return { success: true } // already at the edge

    await db.$transaction([
      db.articleImage.update({
        where: { id: neighbor.id },
        data: { sortOrder: current.sortOrder },
      }),
      db.articleImage.update({
        where: { id: imageId },
        data: { sortOrder: neighbor.sortOrder },
      }),
    ])

    await revalidateArticlePaths(
      current.articleId,
      current.article.isPublished ? current.article.slug : null,
    )
    return { success: true }
  } catch (err) {
    console.error('reorderGalleryImage failed:', err)
    return { success: false, error: 'Greška pri promjeni redoslijeda.' }
  }
}
