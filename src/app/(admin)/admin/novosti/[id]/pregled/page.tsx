import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Calendar, User, Tag, Eye, Pencil, ExternalLink } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { ArticleContent } from '@/components/article/article-content'
import { ArticleGallery } from '@/components/article/article-gallery'
import type { PartialBlock } from '@blocknote/core'

// Admin-only preview: renders the article with its full public layout but
// fetches by article id (not slug) and ignores isPublished, so drafts can
// be previewed before publishing. Not indexable.
export const metadata: Metadata = {
  title: 'Pregled članka',
  robots: { index: false, follow: false },
}

async function getArticleForPreview(id: string) {
  try {
    return await db.article.findUnique({
      where: { id },
      include: {
        author: { select: { firstName: true, lastName: true } },
        tags: { include: { tag: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })
  } catch (error) {
    console.error('Preview fetch failed:', error)
    return null
  }
}

type PageProps = Readonly<{ params: Promise<{ id: string }> }>

export default async function ArticlePreviewPage({ params }: PageProps) {
  await requireAdmin()
  const { id } = await params
  const article = await getArticleForPreview(id)
  if (!article) notFound()

  const fallbackDate = article.publishedAt ?? article.updatedAt

  return (
    <>
      {/* Preview banner — admin-only, sticky at the top of the viewport. */}
      <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-200 text-amber-900">
        <div className="container mx-auto max-w-5xl px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="font-semibold">Pregled članka</span>
            <span
              className={[
                'inline-block text-xs font-medium px-2 py-0.5 rounded border',
                article.isPublished
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-100 text-gray-700 border-gray-300',
              ].join(' ')}
            >
              {article.isPublished ? 'Objavljeno' : 'Skica'}
            </span>
            <span className="hidden sm:inline text-amber-800/80">
              Ova stranica nije javno dostupna.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/novosti/${article.id}/uredi`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-amber-300 rounded hover:bg-amber-100 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Uredi
            </Link>
            {article.isPublished && (
              <Link
                href={`/novosti/${article.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-amber-300 rounded hover:bg-amber-100 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Javna stranica
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Cover image */}
      {article.coverImage && (
        <section className="py-8 px-4 bg-gray-50">
          <div className="container mx-auto max-w-3xl">
            <div className="relative overflow-hidden rounded-2xl h-64 md:h-80 bg-gray-100">
              <Image
                src={article.coverImage}
                alt={article.title}
                fill
                priority
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 768px"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
          </div>
        </section>
      )}

      <article className="py-12 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          <div>
            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {article.tags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full border border-cyan-100"
                  >
                    <Tag className="w-3 h-3" />
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-8 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(fallbackDate, 'long')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>
                  {article.author.firstName} {article.author.lastName}
                </span>
              </div>
            </div>

            {article.excerpt && (
              <p className="text-lg text-gray-600 leading-relaxed mb-8 font-medium">
                {article.excerpt}
              </p>
            )}

            <ArticleContent content={article.content as PartialBlock[]} />
          </div>

          {article.images.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Galerija fotografija
              </h2>
              <ArticleGallery
                images={article.images}
                articleTitle={article.title}
              />
            </div>
          )}

          <div className="mt-10 pt-8 border-t border-gray-100">
            <Link
              href={`/admin/novosti/${article.id}/uredi`}
              className="inline-flex items-center gap-1.5 text-sm text-cyan-600 hover:underline font-medium"
            >
              <ArrowLeft className="w-4 h-4" /> Natrag na uređivanje
            </Link>
          </div>
        </div>
      </article>
    </>
  )
}
