'use server'

import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { City } from '@prisma/client'
import type { AdminActionResult, PaginatedResult } from '@/lib/action-types'
import {
  autosaveArticleSchema,
  type AutosaveArticleInput,
} from '@/lib/validators/admin/article'
import { upsertTagByName } from '@/lib/tags'
import { extractImageUrls } from '@/lib/blocknote-images'
import { destroyCloudinaryAssets } from '@/lib/cloudinary-cleanup'
import { removedAssetUrls } from '@/lib/cloudinary-url'

type ArticleRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverImage: string | null
  isPublished: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  city: City
  author: { firstName: string; lastName: string } | null
  tags: { tag: { id: string; name: string; slug: string } }[]
}

type ArticleFilters = {
  search?: string
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT'
  page?: number
  pageSize?: number
}

export async function getArticles(
  filters: ArticleFilters = {},
): Promise<PaginatedResult<ArticleRow>> {
  const { city } = await requireAdminCtx()

  const { search, status = 'ALL', page = 1, pageSize = 20 } = filters

  const where = {
    city,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(status === 'PUBLISHED' ? { isPublished: true } : {}),
    ...(status === 'DRAFT' ? { isPublished: false } : {}),
  }

  const [data, total] = await Promise.all([
    db.article.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        city: true,
        author: { select: { firstName: true, lastName: true } },
        tags: {
          select: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.article.count({ where }),
  ])

  return {
    data,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  }
}

export async function getArticle(id: string) {
  const { city } = await requireAdminCtx()
  // findFirst (not findUnique) so a cross-city id resolves to null — the edit
  // page turns that into a 404, indistinguishable from a nonexistent article.
  return db.article.findFirst({
    where: { id, city },
    include: {
      tags: { include: { tag: true } },
      images: { orderBy: { sortOrder: 'asc' } },
    },
  })
}

async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await db.article.findUnique({
    where: { slug },
    select: { id: true },
  })
  if (!existing) return false
  return existing.id !== excludeId
}

/**
 * Generate a short, URL-safe suffix for draft slugs. Uses hex of random bytes
 * so we don't leak cuid structure and keep slugs readable.
 */
function draftSlugSuffix(): string {
  return randomBytes(4).toString('hex')
}

/**
 * Create a blank draft article and return its id so the caller can redirect
 * into the edit view. This replaces the old "fill the whole form first, then
 * POST" flow and lets auto-save own the persistence lifecycle from step one.
 */
export async function createDraftArticle(): Promise<
  AdminActionResult & { articleId?: string }
> {
  const { session, city } = await requireAdminCtx()

  try {
    // Retry once on the extremely unlikely slug collision.
    let slug = `skica-${draftSlugSuffix()}`
    if (await isSlugTaken(slug)) slug = `skica-${draftSlugSuffix()}`

    const article = await db.article.create({
      data: {
        slug,
        title: 'Novi članak',
        excerpt: null,
        content: [] as never,
        coverImage: null,
        authorId: session.user.id,
        isPublished: false,
        publishedAt: null,
        // Auto-stamped from the authoring admin's city — no picker.
        city,
      },
      select: { id: true },
    })

    // Admin list is rendered dynamically on each request, so no
    // revalidatePath call is needed — and calling one from a server-
    // component render (which invokes this action) is forbidden in
    // Next.js 15.
    return { success: true, articleId: article.id }
  } catch (err) {
    console.error('createDraftArticle failed:', err)
    return { success: false, error: 'Greška pri kreiranju skice.' }
  }
}

/**
 * Auto-save for an existing article. Accepts a relaxed payload (title may be
 * empty) so admins can type incrementally. Never touches isPublished —
 * publishing is a deliberate action via publishArticle / unpublishArticle.
 */
export async function autosaveArticle(
  input: AutosaveArticleInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = autosaveArticleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { id, ...data } = parsed.data

  if (await isSlugTaken(data.slug, id)) {
    return { success: false, error: 'Članak s tim slugom već postoji.' }
  }

  try {
    const existing = await db.article.findUnique({
      where: { id },
      select: {
        slug: true,
        isPublished: true,
        coverImage: true,
        content: true,
        city: true,
      },
    })
    // Fail closed: a cross-city id is indistinguishable from a missing one.
    if (existing?.city !== city) {
      return { success: false, error: 'Članak nije pronađen.' }
    }

    const oldUrls = [
      ...(existing.coverImage ? [existing.coverImage] : []),
      ...extractImageUrls(existing.content),
    ]
    const newUrls = [
      ...(data.coverImage ? [data.coverImage] : []),
      ...extractImageUrls(data.content),
    ]
    // Diffed on resolved public ids, not raw strings: the same asset has
    // different URLs whenever their delivery transformations differ, and a
    // string diff would read a still-referenced image as removed and destroy
    // it. The watermark backfill rewrites stored URLs, so an editor tab opened
    // before it ran submits the older spelling of every image it still holds.
    const removedUrls = removedAssetUrls(oldUrls, newUrls)

    await db.$transaction(async (tx) => {
      await tx.article.update({
        where: { id },
        data: {
          slug: data.slug,
          title: data.title.trim(),
          excerpt: data.excerpt?.trim() || null,
          content: data.content as never,
          coverImage: data.coverImage || null,
        },
      })

      await tx.articleTag.deleteMany({ where: { articleId: id } })
      if (data.tagNames.length > 0) {
        const tags = await Promise.all(
          data.tagNames.map((name) => upsertTagByName(name, tx)),
        )
        await tx.articleTag.createMany({
          data: tags.map((t) => ({ articleId: id, tagId: t.id })),
          skipDuplicates: true,
        })
      }
    })

    if (removedUrls.length > 0) {
      await destroyCloudinaryAssets(removedUrls)
    }

    revalidatePath('/admin/novosti')
    revalidatePath(`/admin/novosti/${id}/uredi`)
    if (existing.isPublished) {
      revalidatePath('/novosti')
      if (existing.slug !== data.slug) revalidatePath(`/novosti/${existing.slug}`)
      revalidatePath(`/novosti/${data.slug}`)
    }
    return { success: true }
  } catch (err) {
    console.error('autosaveArticle failed:', err)
    return { success: false, error: 'Greška pri spremanju.' }
  }
}

export async function publishArticle(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const article = await db.article.findUnique({
      where: { id },
      select: { slug: true, publishedAt: true, city: true },
    })
    if (article?.city !== city) {
      return { success: false, error: 'Članak nije pronađen.' }
    }

    await db.article.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: article.publishedAt ?? new Date(),
      },
    })

    revalidatePath('/admin/novosti')
    revalidatePath('/novosti')
    revalidatePath(`/novosti/${article.slug}`)
    return { success: true }
  } catch (err) {
    console.error('publishArticle failed:', err)
    return { success: false, error: 'Greška pri objavi članka.' }
  }
}

export async function unpublishArticle(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const article = await db.article.findUnique({
      where: { id },
      select: { slug: true, city: true },
    })
    if (article?.city !== city) {
      return { success: false, error: 'Članak nije pronađen.' }
    }

    await db.article.update({
      where: { id },
      data: { isPublished: false },
    })

    revalidatePath('/admin/novosti')
    revalidatePath('/novosti')
    revalidatePath(`/novosti/${article.slug}`)
    return { success: true }
  } catch (err) {
    console.error('unpublishArticle failed:', err)
    return { success: false, error: 'Greška pri povlačenju članka.' }
  }
}

export async function deleteArticle(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const article = await db.article.findUnique({
      where: { id },
      select: {
        slug: true,
        coverImage: true,
        content: true,
        city: true,
        images: { select: { url: true } },
      },
    })
    if (article?.city !== city) {
      return { success: false, error: 'Članak nije pronađen.' }
    }

    // Collect every Cloudinary URL referenced by this article.
    const urls = [
      ...(article.coverImage ? [article.coverImage] : []),
      ...extractImageUrls(article.content),
      ...article.images.map((i) => i.url),
    ]

    // DB delete first; ArticleImage + ArticleTag rows cascade.
    await db.article.delete({ where: { id } })

    // Best-effort Cloudinary cleanup. Swallows individual failures.
    if (urls.length > 0) {
      await destroyCloudinaryAssets(urls)
    }

    revalidatePath('/admin/novosti')
    revalidatePath('/novosti')
    revalidatePath(`/novosti/${article.slug}`)
    return { success: true }
  } catch (err) {
    console.error('deleteArticle failed:', err)
    return { success: false, error: 'Greška pri brisanju članka.' }
  }
}
