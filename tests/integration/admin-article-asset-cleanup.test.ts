/**
 * The article actions destroy Cloudinary assets an edit no longer references.
 * Since 2026-09-01 stored urls carry the watermark overlay, so "no longer
 * referenced" has to be decided on the asset's public id, not on the url
 * string: an editor tab opened before the watermark backfill submits the
 * older, plain spelling of every image it still holds, and a string diff would
 * read each of those as removed and delete a live image. Pinned here at the
 * action level, with the Cloudinary client stubbed so the destroy calls are
 * observable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin } from './helpers/factory'
import { withWatermark } from '@/lib/cloudinary-url'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { destroy } = vi.hoisted(() => ({
  destroy: vi.fn(async (_publicId: string) => ({ result: 'ok' })),
}))
vi.mock('@/lib/cloudinary', () => ({
  default: { uploader: { destroy } },
}))

const { autosaveArticle, deleteArticle } = await import('@/actions/admin/article')

const CLOUD = 'https://res.cloudinary.com/dgc2tp4f8/image/upload'
const COVER_PLAIN = `${CLOUD}/v1700000001/articles/covers/cover-a.jpg`
const INLINE_PLAIN = `${CLOUD}/v1700000002/articles/inline/inline-a.jpg`

let seq = 0
const uid = () => `${Date.now()}-${seq++}`

function imageBlock(url: string) {
  return { id: uid(), type: 'image', props: { url, caption: '' }, children: [] }
}

/** An article whose stored urls are the watermarked spelling (post-backfill). */
async function seedWatermarkedArticle() {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  const article = await db.article.create({
    data: {
      slug: `cleanup-${uid()}`,
      title: 'Čišćenje',
      authorId: admin.id,
      city: 'SPLIT',
      coverImage: withWatermark(COVER_PLAIN),
      content: [imageBlock(withWatermark(INLINE_PLAIN))],
    },
  })
  return article
}

function autosave(article: { id: string; slug: string }, over: {
  coverImage?: string | null
  content?: unknown[]
}) {
  return autosaveArticle({
    id: article.id,
    slug: article.slug,
    title: 'Čišćenje',
    excerpt: null,
    coverImage: over.coverImage === undefined ? withWatermark(COVER_PLAIN) : over.coverImage,
    content: over.content ?? [imageBlock(withWatermark(INLINE_PLAIN))],
    tagNames: [],
  })
}

beforeEach(() => {
  destroy.mockClear()
})

describe('autosaveArticle — asset cleanup is keyed on the public id', () => {
  it('resubmitting the same images in their pre-watermark spelling destroys nothing', async () => {
    const article = await seedWatermarkedArticle()

    const res = await autosave(article, {
      coverImage: COVER_PLAIN,
      content: [imageBlock(INLINE_PLAIN)],
    })
    expect(res.success).toBe(true)
    expect(destroy).not.toHaveBeenCalled()

    // The action stores whatever the client sent — it does not re-watermark.
    const row = await db.article.findUnique({
      where: { id: article.id },
      select: { coverImage: true },
    })
    expect(row?.coverImage).toBe(COVER_PLAIN)
  })

  it('dropping the inline image destroys exactly that asset, by its clean public id', async () => {
    const article = await seedWatermarkedArticle()

    const res = await autosave(article, { content: [] })
    expect(res.success).toBe(true)
    expect(destroy).toHaveBeenCalledTimes(1)
    // No watermark segment, no version — the id Cloudinary actually knows.
    expect(destroy).toHaveBeenCalledWith('articles/inline/inline-a')
  })

  it('swapping the cover destroys the old cover only', async () => {
    const article = await seedWatermarkedArticle()
    const nextCover = withWatermark(`${CLOUD}/v1700000003/articles/covers/cover-b.jpg`)

    const res = await autosave(article, { coverImage: nextCover })
    expect(res.success).toBe(true)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledWith('articles/covers/cover-a')
  })
})

describe('deleteArticle — destroys every referenced asset by clean id', () => {
  it('cover and inline image both go, resolved through the watermark', async () => {
    const article = await seedWatermarkedArticle()

    const res = await deleteArticle(article.id)
    expect(res).toEqual({ success: true })
    const ids = destroy.mock.calls.map((c) => c[0]).sort()
    expect(ids).toEqual(['articles/covers/cover-a', 'articles/inline/inline-a'])
  })
})
