import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Calendar } from 'lucide-react'
import { formatDate } from '@/lib/format'

interface NewsArticle {
  slug: string
  title: string
  excerpt: string | null
  coverImage: string | null
  publishedAt: Date | null
  tags: { tag: { name: string } }[]
}

export function NewsSection({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) return null

  return (
    <section className="py-16 px-4 bg-white">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-2">Novosti</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Najnovije vijesti</h2>
          </div>
          <Link href="/novosti" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 hover:underline">
            Sve vijesti <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/novosti/${article.slug}`}
              className="group flex flex-col rounded-2xl overflow-hidden border border-gray-100 hover:border-cyan-200 hover:shadow-lg hover:shadow-cyan-50 bg-white transition-all"
            >
              <div className="relative h-44 overflow-hidden bg-gray-100">
                {article.coverImage ? (
                  <Image
                    src={article.coverImage}
                    alt={article.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                    <span className="text-4xl">🤖</span>
                  </div>
                )}
                {article.tags.length > 0 && (
                  <span className="absolute top-3 left-3 text-xs font-semibold text-cyan-700 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full border border-cyan-100">
                    {article.tags[0].tag.name}
                  </span>
                )}
              </div>
              <div className="flex flex-col flex-1 p-5">
                <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-cyan-600 transition-colors">
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="text-xs text-gray-500 line-clamp-2 flex-1 leading-relaxed mb-3">
                    {article.excerpt}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                  {article.publishedAt && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(article.publishedAt)}
                    </div>
                  )}
                  <span className="text-xs text-cyan-500 font-semibold group-hover:underline flex items-center gap-1">
                    Čitaj <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-6 sm:hidden">
          <Link href="/novosti" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 hover:underline">
            Sve vijesti <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
