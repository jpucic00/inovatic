import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Calendar, Newspaper } from 'lucide-react'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Novosti',
  description: 'Najnovije vijesti i obavijesti Udruge za robotiku Inovatic iz Splita – natjecanja, radionice, upisi i događaji.',
  openGraph: {
    title: 'Novosti | Inovatic',
    description: 'Pratite naša natjecanja, radionice i sve što se događa u Inovatic zajednici.',
    url: 'https://udruga-inovatic.hr/novosti',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/novosti' },
}

export const revalidate = 3600

async function getArticles(page: number, perPage = 9) {
  try {
    const [articles, total] = await Promise.all([
      db.article.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          publishedAt: true,
          coverImage: true,
          tags: { include: { tag: true } },
        },
      }),
      db.article.count({ where: { isPublished: true } }),
    ])
    return { articles, total, totalPages: Math.ceil(total / perPage) }
  } catch (error) {
    console.error('Failed to fetch articles:', error)
    return { articles: [], total: 0, totalPages: 0 }
  }
}

const gradients = [
  'from-cyan-400 to-blue-500',
  'from-blue-400 to-indigo-500',
  'from-cyan-500 to-teal-500',
  'from-sky-400 to-cyan-500',
]

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ stranica?: string }>
}) {
  const { stranica } = await searchParams
  const page = Math.max(1, parseInt(stranica ?? '1', 10) || 1)
  const { articles, total, totalPages } = await getArticles(page)

  return (
    <>
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-100 rounded-full opacity-40 blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-yellow-100 rounded-full opacity-40 blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
        <div className="relative container mx-auto max-w-3xl text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Novosti</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Vijesti i obavijesti</h1>
          <p className="text-gray-600 text-lg">
            Pratite naša natjecanja, radionice i sve što se događa u Inovatic zajednici.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          {articles.length === 0 ? (
            <div className="text-center py-20">
              <Newspaper className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-2">Novosti uskoro dolaze.</p>
              <p className="text-gray-400 text-sm">Pratite nas na društvenim mrežama za najnovije vijesti.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {articles.map((article, idx) => (
                  <Link
                    key={article.id}
                    href={`/novosti/${article.slug}`}
                    className="group flex flex-col rounded-2xl overflow-hidden border border-gray-100 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-100 bg-white transition-all border-t-2 border-t-transparent hover:border-t-cyan-400"
                  >
                    {/* Cover image */}
                    <div className="relative h-48 overflow-hidden bg-gray-100">
                      {article.coverImage ? (
                        <Image
                          src={article.coverImage}
                          alt={article.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div
                          className={`w-full h-full bg-gradient-to-br ${gradients[idx % gradients.length]} flex items-center justify-center`}
                        >
                          <Newspaper className="w-10 h-10 text-white/60" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col flex-1 p-5">
                      {/* Tags */}
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {article.tags.slice(0, 2).map(({ tag }) => (
                            <span
                              key={tag.id}
                              className="text-xs font-semibold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-100"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}

                      <h2 className="font-bold text-gray-900 mb-2 text-base leading-snug group-hover:text-cyan-600 transition-colors line-clamp-2">
                        {article.title}
                      </h2>

                      {article.excerpt && (
                        <p className="text-sm text-gray-500 line-clamp-3 mb-3 flex-1 leading-relaxed">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(article.publishedAt)}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs text-cyan-500 font-semibold group-hover:underline">
                          Čitaj više <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-12">
                  {page > 1 && (
                    <Link
                      href={`/novosti?stranica=${page - 1}`}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-cyan-300 hover:text-cyan-600 transition-colors"
                    >
                      ← Prethodna
                    </Link>
                  )}
                  <span className="text-sm text-gray-500 px-3">
                    Stranica {page} od {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={`/novosti?stranica=${page + 1}`}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-cyan-300 hover:text-cyan-600 transition-colors"
                    >
                      Sljedeća →
                    </Link>
                  )}
                </div>
              )}

              <p className="text-center text-xs text-gray-400 mt-4">
                Ukupno {total} {total === 1 ? 'objava' : total < 5 ? 'objave' : 'objava'}
              </p>
            </>
          )}
        </div>
      </section>
    </>
  )
}
