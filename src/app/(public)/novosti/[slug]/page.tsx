import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, User } from 'lucide-react'
import { db } from '@/lib/db'

export const revalidate = 3600

async function getArticle(slug: string) {
  try {
    return await db.article.findUnique({
      where: { slug, isPublished: true },
      include: {
        author: { select: { firstName: true, lastName: true } },
        tags: { include: { tag: true } },
      },
    })
  } catch {
    return null
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
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
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

  return (
    <article className="py-12 px-4 bg-white">
      <div className="container mx-auto max-w-2xl">
        <Link
          href="/novosti"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-cyan-600 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Sve novosti
        </Link>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {article.tags.map(({ tag }) => (
              <span key={tag.id} className="text-xs font-semibold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full border border-cyan-100">
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
          {article.title}
        </h1>

        <div className="flex items-center gap-4 text-sm text-gray-400 mb-8 pb-6 border-b border-gray-100">
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

        <div
          className="prose prose-gray max-w-none prose-headings:font-extrabold prose-a:text-cyan-600 prose-strong:text-gray-800"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

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
  )
}
