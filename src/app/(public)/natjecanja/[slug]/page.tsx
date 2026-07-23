import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ExternalLink, Trophy, ListChecks, Info } from 'lucide-react'
import { GearDecor } from '@/components/shared/decorations'
import {
  competitions,
  getCompetitionBySlug,
  getNextCompetition,
  COMPETITION_ICONS,
  COMPETITION_TONES,
  type Competition,
} from '@/lib/competitions-data'

/** Teaser for the next competition in the list, styled in that program's tone. */
function NextCompetitionBanner({ comp }: Readonly<{ comp: Competition }>) {
  const tone = COMPETITION_TONES[comp.tone]
  return (
    <section className={`py-14 px-4 relative overflow-hidden ${tone.banner}`}>
      <GearDecor size={80} className={`absolute -bottom-4 right-8 opacity-10 ${tone.bannerTitle}`} />
      <div className="container mx-auto text-center max-w-xl relative">
        <p className={`text-sm font-semibold mb-2 ${tone.bannerLead}`}>
          Pogledaj i drugi natjecateljski program
        </p>
        <h2 className={`text-2xl font-extrabold mb-4 ${tone.bannerTitle}`}>{comp.title}</h2>
        <Link
          href={`/natjecanja/${comp.slug}`}
          className={`inline-flex items-center gap-2 px-7 py-3.5 font-semibold rounded-xl transition-colors shadow-sm ${tone.bannerButton}`}
        >
          {comp.title} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  )
}

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

  const tone = COMPETITION_TONES[comp.tone]
  const Icon = COMPETITION_ICONS[slug] || Trophy
  const nextComp = getNextCompetition(slug)

  return (
    <>
      {/* Hero */}
      <section className={`py-16 px-4 overflow-hidden relative ${tone.heroBg}`}>
        <div aria-hidden="true" className={`absolute -top-16 -left-16 w-64 h-64 rounded-full blur-3xl opacity-40 pointer-events-none ${tone.heroBlobA}`} />
        <div aria-hidden="true" className={`absolute -bottom-12 -right-12 w-56 h-56 rounded-full blur-3xl opacity-40 pointer-events-none ${tone.heroBlobB}`} />
        <GearDecor size={48} className={`absolute top-8 right-10 opacity-60 rotate-12 ${tone.heroGear}`} />

        <div className="container mx-auto max-w-3xl relative">
          <Link
            href="/natjecanja"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-cyan-600 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Sva natjecanja
          </Link>
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 ${tone.iconTile}`}>
              <Icon className={`w-8 h-8 ${tone.iconGlyph}`} />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-2 leading-tight">
              {comp.title}
            </h1>
            <p className="text-gray-400 text-sm font-semibold uppercase tracking-wide mb-4">{comp.subtitle}</p>
            {comp.highlight && (
              <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${tone.pill}`}>
                {comp.highlight}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          {comp.programDetails && (
            <dl className="grid sm:grid-cols-3 gap-4 mb-10">
              {comp.programDetails.map((detail) => (
                <div key={detail.label} className="rounded-xl bg-gray-50 border border-gray-100 p-5">
                  <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-cyan-600 mb-2">
                    <Info className="w-3.5 h-3.5" />
                    {detail.label}
                  </dt>
                  <dd className="text-sm text-gray-700 leading-relaxed">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="space-y-5 text-gray-600 leading-relaxed text-lg text-left">
            {comp.paragraphs.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
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
              <h2 className="text-2xl font-extrabold text-gray-900">{comp.categoriesTitle ?? 'Kategorije natjecanja'}</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {comp.categories.map((cat, i) => (
                <div key={cat.name} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                  <div className={`flex items-center gap-3 ${cat.description ? 'mb-3' : ''}`}>
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 font-extrabold text-sm flex-shrink-0">
                      {i + 1}
                    </span>
                    <h3 className="font-bold text-gray-900">{cat.name}</h3>
                  </div>
                  {cat.description && (
                    <p className="text-sm text-gray-600 leading-relaxed text-left">{cat.description}</p>
                  )}
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

      {/* Navigate to the next competition */}
      {nextComp && (
        <NextCompetitionBanner comp={nextComp} />
      )}
    </>
  )
}
