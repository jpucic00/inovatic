import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Calendar, Trophy, Award, Newspaper } from 'lucide-react'
import { GearDecor } from '@/components/shared/decorations'
import { competitions } from '@/lib/competitions-data'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/format'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Natjecateljski programi',
  description:
    'Naši najnadareniji polaznici sudjeluju na FIRST LEGO League (FLL) i World Robot Olympiad (WRO) natjecanjima. Tim CroSpec – srebrna medalja WRO 2025, Singapur.',
  openGraph: {
    title: 'Natjecateljski programi | Inovatic',
    description: 'FIRST LEGO League i World Robot Olympiad – natjecanja u robotici za djecu. Tim CroSpec – srebrna medalja WRO 2025.',
    url: 'https://udruga-inovatic.hr/natjecanja',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – Natjecanja u robotici' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/natjecanja' },
}

const icons = { 'first-lego-league': Trophy, 'world-robot-olympiad': Award } as const

async function getCompetitionArticles() {
  try {
    return await db.article.findMany({
      where: {
        isPublished: true,
        tags: { some: { tag: { slug: 'natjecanja' } } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 6,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    })
  } catch {
    return []
  }
}

const gradients = [
  'from-cyan-400 to-blue-500',
  'from-blue-400 to-indigo-500',
  'from-cyan-500 to-teal-500',
]

export default async function NatjecanjaPage() {
  const articles = await getCompetitionArticles()

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden relative">
        <div aria-hidden="true" className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-cyan-300 blur-3xl opacity-40 pointer-events-none" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-12 w-56 h-56 rounded-full bg-yellow-200 blur-3xl opacity-40 pointer-events-none" />
        <GearDecor size={48} className="absolute top-8 right-10 text-cyan-200 opacity-60 rotate-12" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Natjecanja</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            Natjecateljski <span className="text-cyan-500">programi</span>
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Naši najnadareniji polaznici nastupaju na najprestižnijim robotičkim natjecanjima u Hrvatskoj i svijetu.
            Natjecanja razvijaju timski rad, strategiju i samopouzdanje.
          </p>
        </div>
      </section>

      {/* Competition cards */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-8">
            {competitions.map((comp) => {
              const Icon = icons[comp.slug as keyof typeof icons] || Trophy
              const isWro = comp.slug === 'world-robot-olympiad'
              return (
                <Link
                  key={comp.slug}
                  href={`/natjecanja/${comp.slug}`}
                  className={`group relative flex flex-col rounded-2xl overflow-hidden border transition-all hover:shadow-lg ${
                    isWro
                      ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 hover:shadow-yellow-100'
                      : 'bg-cyan-50 border-cyan-200 hover:border-cyan-400 hover:shadow-cyan-100'
                  }`}
                >
                  <div className={`p-8 flex flex-col flex-1`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                      isWro ? 'bg-yellow-400' : 'bg-cyan-500'
                    }`}>
                      <Icon className={`w-7 h-7 ${isWro ? 'text-gray-900' : 'text-white'}`} />
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900 mb-1 group-hover:text-cyan-600 transition-colors">
                      {comp.title}
                    </h2>
                    <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{comp.shortTitle}</p>
                    <p className="text-gray-600 leading-relaxed mb-6 flex-1">{comp.description}</p>
                    {isWro && (
                      <span className="inline-block self-start mb-4 text-xs font-bold text-yellow-800 bg-yellow-200 px-2.5 py-0.5 rounded-full">
                        Srebrna medalja WRO 2025 – Singapur
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 group-hover:underline">
                      Saznaj više <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Competition news */}
      {articles.length > 0 && (
        <section className="py-16 px-4 bg-cyan-50/30">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-10">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Novosti</span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Novosti s natjecanja</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article, idx) => (
                <Link
                  key={article.slug}
                  href={`/novosti/${article.slug}`}
                  className="group flex flex-col rounded-2xl overflow-hidden border border-gray-100 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-100 bg-white transition-all border-t-2 border-t-transparent hover:border-t-cyan-400"
                >
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
                      <div className={`w-full h-full bg-gradient-to-br ${gradients[idx % gradients.length]} flex items-center justify-center`}>
                        <Newspaper className="w-10 h-10 text-white/60" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 p-5">
                    {article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {article.tags.slice(0, 2).map(({ tag }) => (
                          <span
                            key={tag.name}
                            className="text-xs font-semibold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-100"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <h3 className="font-bold text-gray-900 mb-2 text-base leading-snug group-hover:text-cyan-600 transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="text-sm text-gray-500 line-clamp-3 mb-3 flex-1 leading-relaxed">{article.excerpt}</p>
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
            <div className="text-center mt-8">
              <Link
                href="/novosti"
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-cyan-600 border-2 border-cyan-200 rounded-xl hover:border-cyan-400 hover:bg-cyan-50 transition-colors"
              >
                Sve novosti <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
