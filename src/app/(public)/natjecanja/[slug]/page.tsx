import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ExternalLink, Trophy, Award, ListChecks } from 'lucide-react'
import { GearDecor } from '@/components/shared/decorations'
import { competitions, getCompetitionBySlug } from '@/lib/competitions-data'

export function generateStaticParams() {
  return competitions.map((c) => ({ slug: c.slug }))
}

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const comp = getCompetitionBySlug(slug)
  if (!comp) return { title: 'Natjecanje nije pronađeno' }
  return {
    title: `${comp.title} | Natjecanja`,
    description: comp.description,
    openGraph: {
      title: `${comp.title} | Inovatic`,
      description: comp.description,
      url: `https://udruga-inovatic.hr/natjecanja/${slug}`,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${comp.title} | Inovatic` }],
    },
    alternates: { canonical: `https://udruga-inovatic.hr/natjecanja/${slug}` },
  }
}

export default async function CompetitionDetailPage({ params }: PageProps) {
  const { slug } = await params
  const comp = getCompetitionBySlug(slug)
  if (!comp) notFound()

  const isWro = slug === 'world-robot-olympiad'
  const otherComp = competitions.find((c) => c.slug !== slug)

  return (
    <>
      {/* Hero */}
      <section className={`py-16 px-4 overflow-hidden relative ${
        isWro
          ? 'bg-gradient-to-br from-yellow-50 via-white to-orange-50'
          : 'bg-gradient-to-br from-cyan-50 via-white to-blue-50'
      }`}>
        <div aria-hidden="true" className={`absolute -top-16 -left-16 w-64 h-64 rounded-full blur-3xl opacity-40 pointer-events-none ${
          isWro ? 'bg-yellow-300' : 'bg-cyan-300'
        }`} />
        <div aria-hidden="true" className={`absolute -bottom-12 -right-12 w-56 h-56 rounded-full blur-3xl opacity-40 pointer-events-none ${
          isWro ? 'bg-orange-200' : 'bg-yellow-200'
        }`} />
        <GearDecor size={48} className={`absolute top-8 right-10 opacity-60 rotate-12 ${isWro ? 'text-yellow-200' : 'text-cyan-200'}`} />

        <div className="container mx-auto max-w-3xl relative">
          <Link
            href="/natjecanja"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-cyan-600 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Sva natjecanja
          </Link>
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 ${
              isWro ? 'bg-yellow-400' : 'bg-cyan-500'
            }`}>
              {isWro ? <Award className="w-8 h-8 text-gray-900" /> : <Trophy className="w-8 h-8 text-white" />}
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-2 leading-tight">
              {comp.title}
            </h1>
            <p className="text-gray-400 text-sm font-semibold uppercase tracking-wide mb-4">{comp.subtitle}</p>
            {isWro && (
              <span className="inline-block text-xs font-bold text-yellow-800 bg-yellow-200 px-3 py-1 rounded-full">
                Srebrna medalja WRO 2025 – Singapur
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          <div className="space-y-5 text-gray-600 leading-relaxed text-lg text-justify">
            {comp.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Categories (FLL only) */}
      {comp.categories.length > 0 && (
        <section className="py-16 px-4 bg-cyan-50/30">
          <div className="container mx-auto max-w-3xl">
            <div className="flex items-center gap-3 mb-8">
              <ListChecks className="w-6 h-6 text-cyan-500" />
              <h2 className="text-2xl font-extrabold text-gray-900">Kategorije natjecanja</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {comp.categories.map((cat, i) => (
                <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 font-extrabold text-sm">
                      {i + 1}
                    </span>
                    <h3 className="font-bold text-gray-900">{cat.name}</h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed text-justify">{cat.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* External links */}
      {comp.externalLinks.length > 0 && (
        <section className={`py-12 px-4 ${comp.categories.length > 0 ? 'bg-white' : 'bg-cyan-50/30'}`}>
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-xl font-extrabold text-gray-900 mb-6">Više o natjecanju</h2>
            <div className="flex flex-wrap gap-3">
              {comp.externalLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-50 text-cyan-700 font-medium text-sm rounded-xl border border-cyan-200 hover:border-cyan-400 hover:bg-cyan-100 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Archive */}
      {comp.archive.length > 0 && (
        <section className="py-12 px-4 bg-white">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-xl font-extrabold text-gray-900 mb-6">Arhiva natjecanja</h2>
            <div className="space-y-3">
              {comp.archive.map((entry) => (
                <div key={entry.label} className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
                  {entry.slug ? (
                    <Link
                      href={`/novosti/${entry.slug}`}
                      className="text-cyan-600 hover:text-cyan-800 font-medium hover:underline transition-colors"
                    >
                      {entry.label}
                    </Link>
                  ) : (
                    <span className="text-gray-500">{entry.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Navigate to other competition */}
      {otherComp && (
        <section className={`py-14 px-4 relative overflow-hidden ${
          isWro
            ? 'bg-gradient-to-r from-cyan-500 to-cyan-600'
            : 'bg-gradient-to-r from-yellow-400 to-orange-500'
        }`}>
          <GearDecor size={80} className={`absolute -bottom-4 right-8 opacity-10 ${isWro ? 'text-white' : 'text-gray-900'}`} />
          <div className="container mx-auto text-center max-w-xl relative">
            <p className={`text-sm font-semibold mb-2 ${isWro ? 'text-cyan-100' : 'text-yellow-900/60'}`}>
              Pogledaj i drugi natjecateljski program
            </p>
            <h2 className={`text-2xl font-extrabold mb-4 ${isWro ? 'text-white' : 'text-gray-900'}`}>
              {otherComp.title}
            </h2>
            <Link
              href={`/natjecanja/${otherComp.slug}`}
              className={`inline-flex items-center gap-2 px-7 py-3.5 font-semibold rounded-xl transition-colors shadow-sm ${
                isWro
                  ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                  : 'bg-cyan-500 text-white hover:bg-cyan-600'
              }`}
            >
              {otherComp.title} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
