import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// city guards 404 via notFound(); admin guards bounce via redirect(). Mirror
// both so the actions behave as in a real request.
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

const {
  getArticles,
  getArticle,
  createDraftArticle,
  autosaveArticle,
  publishArticle,
  unpublishArticle,
  deleteArticle,
} = await import('@/actions/admin/article')
const { addGalleryImages } = await import('@/actions/admin/article-gallery')

let seq = 0
const uid = () => `${Date.now()}-${seq++}`

async function createArticle(city: City, over: { published?: boolean } = {}) {
  const admin = await createAdmin({ city })
  return db.article.create({
    data: {
      slug: `art-${city.toLowerCase()}-${uid()}`,
      title: `Članak ${uid()}`,
      authorId: admin.id,
      city,
      isPublished: over.published ?? false,
    },
  })
}

async function sibenikAdminSession() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

beforeAll(() => {
  // publish/delete may attempt Cloudinary cleanup when urls exist; our fixtures
  // have none, but keep Resend/Cloudinary env unset to be safe.
  delete process.env.CLOUDINARY_API_KEY
})

describe('createDraftArticle — auto-stamps the admin session city', () => {
  it('a Šibenik admin creates a SIBENIK draft', async () => {
    await sibenikAdminSession()
    const res = await createDraftArticle()
    expect(res.success).toBe(true)
    if (!res.success || !res.articleId) return

    const row = await db.article.findUnique({
      where: { id: res.articleId },
      select: { city: true, isPublished: true },
    })
    expect(row).toMatchObject({ city: 'SIBENIK', isPublished: false })
  })
})

describe('getArticles — city-scoped admin list', () => {
  it('returns the Šibenik article and never the Split one under a matching search', async () => {
    const sib = await createArticle('SIBENIK')
    const split = await createArticle('SPLIT')
    await sibenikAdminSession()

    const own = await getArticles({ search: sib.slug })
    expect(own.data.map((a) => a.id)).toContain(sib.id)

    // The Split slug matches the search text, but the city filter excludes it.
    const foreign = await getArticles({ search: split.slug })
    expect(foreign.data).toHaveLength(0)
    expect(foreign.total).toBe(0)
  })
})

describe('getArticle — cross-city id is indistinguishable from nonexistent', () => {
  it('returns the row for a same-city id, null for a cross-city one', async () => {
    const sib = await createArticle('SIBENIK')
    const split = await createArticle('SPLIT')
    await sibenikAdminSession()

    expect((await getArticle(sib.id))?.id).toBe(sib.id)
    expect(await getArticle(split.id)).toBeNull()
  })
})

describe('article mutations — cross-city reads as nonexistent, same-city works', () => {
  it('publishArticle: cross-city leaves the row unpublished, same-city publishes', async () => {
    const sib = await createArticle('SIBENIK')
    const split = await createArticle('SPLIT')
    await sibenikAdminSession()

    expect(await publishArticle(split.id)).toEqual({
      success: false,
      error: 'Članak nije pronađen.',
    })
    const splitRow = await db.article.findUnique({
      where: { id: split.id },
      select: { isPublished: true },
    })
    expect(splitRow?.isPublished).toBe(false)

    expect(await publishArticle(sib.id)).toEqual({ success: true })
  })

  it('unpublishArticle: cross-city leaves the row published', async () => {
    const split = await createArticle('SPLIT', { published: true })
    await sibenikAdminSession()

    expect(await unpublishArticle(split.id)).toEqual({
      success: false,
      error: 'Članak nije pronađen.',
    })
    const splitRow = await db.article.findUnique({
      where: { id: split.id },
      select: { isPublished: true },
    })
    expect(splitRow?.isPublished).toBe(true)
  })

  it('autosaveArticle: cross-city is rejected, same-city updates the title', async () => {
    const sib = await createArticle('SIBENIK')
    const split = await createArticle('SPLIT')
    await sibenikAdminSession()

    const cross = await autosaveArticle({
      id: split.id,
      title: 'Preuzeto',
      slug: `hijack-${uid()}`,
      content: [],
      tagNames: [],
    })
    expect(cross).toEqual({ success: false, error: 'Članak nije pronađen.' })
    const splitRow = await db.article.findUnique({
      where: { id: split.id },
      select: { title: true },
    })
    expect(splitRow?.title).toBe(split.title)

    const own = await autosaveArticle({
      id: sib.id,
      title: 'Novi naslov',
      slug: `sib-updated-${uid()}`,
      content: [],
      tagNames: [],
    })
    expect(own).toEqual({ success: true })
  })

  it('deleteArticle: cross-city leaves the row, same-city deletes', async () => {
    const sib = await createArticle('SIBENIK')
    const split = await createArticle('SPLIT')
    await sibenikAdminSession()

    expect(await deleteArticle(split.id)).toEqual({
      success: false,
      error: 'Članak nije pronađen.',
    })
    expect(await db.article.count({ where: { id: split.id } })).toBe(1)

    expect(await deleteArticle(sib.id)).toEqual({ success: true })
    expect(await db.article.count({ where: { id: sib.id } })).toBe(0)
  })

  it('addGalleryImages: cross-city article is rejected', async () => {
    const split = await createArticle('SPLIT')
    await sibenikAdminSession()

    const res = await addGalleryImages(split.id, ['https://example.com/x.jpg'])
    expect(res).toEqual({ success: false, error: 'Članak nije pronađen.' })
    expect(await db.articleImage.count({ where: { articleId: split.id } })).toBe(0)
  })
})
