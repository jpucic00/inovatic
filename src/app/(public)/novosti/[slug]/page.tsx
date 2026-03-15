import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Calendar, User, Tag } from 'lucide-react'
import { db } from '@/lib/db'
import { ArticleContent } from '@/components/article/article-content'
import { ArticleGallery } from '@/components/article/article-gallery'
import type { PartialBlock } from '@blocknote/core'

export const revalidate = 3600

async function getArticle(slug: string) {
  try {
    return await db.article.findUnique({
      where: { slug, isPublished: true },
      include: {
        author: { select: { firstName: true, lastName: true } },
        tags: { include: { tag: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    })
  } catch {
    return null
  }
}

async function getRelatedArticles(currentSlug: string, tagIds: string[]) {
  if (tagIds.length === 0) return []
  try {
    return await db.article.findMany({
      where: {
        isPublished: true,
        slug: { not: currentSlug },
        tags: { some: { tagId: { in: tagIds } } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { slug: true, title: true, publishedAt: true, coverImage: true },
    })
  } catch {
    return []
  }
}

export async function generateStaticParams() {
  try {
    const articles = await db.article.findMany({
      where: { isPublished: true },
      select: { slug: true },
    })
    return articles.map((a) => ({ slug: a.slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) return { title: 'Vijest nije pronađena' }

  const ogImages = article.coverImage
    ? [{ url: article.coverImage, width: 1200, height: 630, alt: article.title }]
    : []

  return {
    title: article.title,
    description: article.excerpt ?? `Vijest Udruge Inovatic – ${article.title}`,
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      url: `https://udruga-inovatic.hr/novosti/${slug}`,
      type: 'article',
      publishedTime: article.publishedAt?.toISOString(),
      authors: [`${article.author.firstName} ${article.author.lastName}`],
      images: ogImages,
    },
    alternates: { canonical: `https://udruga-inovatic.hr/novosti/${slug}` },
  }
}

function formatDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) notFound()

  const tagIds = article.tags.map(({ tag }) => tag.id)
  const related = await getRelatedArticles(slug, tagIds)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt ?? undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: `${article.author.firstName} ${article.author.lastName}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Udruga za robotiku "Inovatic"',
      url: 'https://udruga-inovatic.hr',
    },
    url: `https://udruga-inovatic.hr/novosti/${slug}`,
    ...(article.coverImage ? { image: article.coverImage } : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Cover image hero */}
      {article.coverImage && (
        <div className="relative w-full h-64 md:h-96 bg-gray-100">
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      <article className={`py-12 px-4 bg-white ${article.coverImage ? '-mt-8 relative z-10' : ''}`}>
        <div className="container mx-auto max-w-3xl">
          {/* Back link */}
          <Link
            href="/novosti"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-cyan-600 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Sve novosti
          </Link>

          {/* Card wrapper when there's a cover image */}
          <div className={article.coverImage ? 'bg-white rounded-2xl shadow-md p-6 md:p-10' : ''}>
            {/* Tags */}
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
                <span>{formatDate(article.publishedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>{article.author.firstName} {article.author.lastName}</span>
              </div>
            </div>

            {article.excerpt && (
              <p className="text-lg text-gray-600 leading-relaxed mb-8 font-medium">
                {article.excerpt}
              </p>
            )}

            <ArticleContent content={article.content as PartialBlock[]} />
          </div>

          {/* Gallery */}
          {article.images.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Galerija fotografija</h2>
              <ArticleGallery images={article.images} articleTitle={article.title} />
            </div>
          )}

          {/* Related articles */}
          {related.length > 0 && (
            <div className="mt-12 pt-10 border-t border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Povezane vijesti</h2>
              <div className="space-y-4">
                {related.map((rel) => (
                  <Link
                    key={rel.slug}
                    href={`/novosti/${rel.slug}`}
                    className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-cyan-200 hover:bg-cyan-50/30 transition-all"
                  >
                    {rel.coverImage ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <Image src={rel.coverImage} alt={rel.title} fill className="object-cover" sizes="64px" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-cyan-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm line-clamp-2 group-hover:text-cyan-600 transition-colors">
                        {rel.title}
                      </p>
                      {rel.publishedAt && (
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(rel.publishedAt)}</p>
                      )}
                    </div>
                    <ArrowLeft className="w-4 h-4 text-cyan-400 rotate-180 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 pt-8 border-t border-gray-100">
            <Link
              href="/novosti"
              className="inline-flex items-center gap-1.5 text-sm text-cyan-600 hover:underline font-medium"
            >
              <ArrowLeft className="w-4 h-4" /> Sve novosti
            </Link>
          </div>
        </div>
      </article>
    </>
  )
}
