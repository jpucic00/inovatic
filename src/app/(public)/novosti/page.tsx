import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Calendar } from 'lucide-react'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Novosti',
  description: 'Najnovije vijesti i obavijesti Udruge za robotiku Inovatic iz Splita.',
}

export const revalidate = 3600

async function getArticles() {
  try {
    return await db.article.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        coverImage: true,
        tags: {
          include: { tag: true },
        },
      },
    })
  } catch {
    return []
  }
}

function formatDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) + '.'
}

export default async function NewsPage() {
  const articles = await getArticles()

  return (
    <>
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Novosti</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Vijesti i obavijesti</h1>
          <p className="text-gray-600 text-lg">
            Pratite naše natjecanja, radionice i sve što se događa u Inovatic zajednici.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          {articles.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-lg mb-2">Novosti uskoro dolaze.</p>
              <p className="text-gray-400 text-sm">Pratite nas na društvenim mrežama za najnovije vijesti.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/novosti/${article.slug}`}
                  className="group block p-6 rounded-2xl border border-gray-100 hover:border-cyan-200 hover:shadow-md bg-white transition-all"
                >
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(article.publishedAt)}</span>
                    {article.tags.length > 0 && (
                      <>
                        <span>·</span>
                        {article.tags.slice(0, 2).map(({ tag }) => (
                          <span key={tag.id} className="text-cyan-600 font-medium">{tag.name}</span>
                        ))}
                      </>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-cyan-600 transition-colors">
                    {article.title}
                  </h2>
                  {article.excerpt && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{article.excerpt}</p>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-sm text-cyan-500 font-semibold group-hover:underline">
                    Čitaj više <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
