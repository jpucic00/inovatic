import type { Metadata } from 'next'
import Link from 'next/link'
import { Trophy, ArrowRight } from 'lucide-react'
import { HeroBackgroundSlideshow } from '@/components/shared/hero-background-slideshow'
import { RobotSvg } from '@/components/shared/robot-svg'
import { RobotHeadSvg } from '@/components/shared/robot-head-svg'
import { GearDecor } from '@/components/shared/decorations'
import { db } from '@/lib/db'
import { StatsSection } from '@/components/public/homepage/StatsSection'
import { CoursesPreview } from '@/components/public/homepage/CoursesPreview'
import { LocationsSection } from '@/components/public/homepage/LocationsSection'
import { TestimonialsSection } from '@/components/public/homepage/TestimonialsSection'
import { NewsSection } from '@/components/public/homepage/NewsSection'
import type { City } from '@prisma/client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    absolute: 'Inovatic – LEGO Robotika za djecu u Splitu',
  },
  description:
    'Udruga Inovatic uči djecu od 6 do 14 godina programiranje i robotiku kroz LEGO Spike programe u Splitu. Upišite dijete danas!',
  openGraph: {
    title: 'Inovatic – LEGO Robotika za djecu u Splitu',
    description: 'Udruga Inovatic uči djecu od 6 do 14 godina programiranje i robotiku u Splitu. Upišite dijete danas!',
    url: 'https://udruga-inovatic.hr',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr' },
}

type LatestNewsArticle = {
  slug: string
  title: string
  excerpt: string | null
  coverImage: string | null
  publishedAt: Date | null
  city: City
  tags: { tag: { name: string } }[]
}

// Art-directed hero: portrait phone photos on mobile (tall box), landscape
// shots on desktop (wide box). object-position focal points keep faces in
// frame — mobile mainly matters on tablets/landscape phones, desktop always.
const heroImagesMobile = [
  { n: 1, pos: '50% 35%' }, // grupa s diplomama – lica u gornjoj sredini
  { n: 2, pos: '50% 42%' }, // dva dječaka (pejzaž)
  { n: 3, pos: '50% 27%' }, // učionica – lica visoko
  { n: 4, pos: '50% 45%' }, // dječak naslonjen na ruke
  { n: 5, pos: '50% 35%' }, // dva dječaka s naočalama
  { n: 6, pos: '50% 70%' }, // lica nisko, strop zauzima vrh
  { n: 7, pos: '50% 28%' }, // dva dječaka „palac gore” – lica visoko
  { n: 8, pos: '50% 40%' }, // velika grupa ispred ulaza
].map(({ n, pos }) => ({
  src: `/images/hero/naslovna/${n}.jpeg`,
  alt: `Djeca na radionici LEGO robotike – fotografija ${n}`,
  objectPosition: pos,
}))

const heroImagesDesktop = [
  { n: 1, pos: '50% 38%' }, // velika grupa s diplomama ispred ulaza
  { n: 2, pos: '50% 35%' }, // dva dječaka s robotom-kockom
  { n: 3, pos: '50% 42%' }, // voditelj s troje djece za stolom
].map(({ n, pos }) => ({
  src: `/images/hero/naslovna/desktop/${n}.jpeg`,
  alt: `Djeca na radionici LEGO robotike – fotografija ${n}`,
  objectPosition: pos,
}))

export default async function HomePage() {
  let latestNews: LatestNewsArticle[] = []
  try {
    latestNews = await db.article.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { slug: true, title: true, excerpt: true, coverImage: true, publishedAt: true, city: true, tags: { select: { tag: { select: { name: true } } } } },
    })
  } catch (error) {
    console.error('Failed to fetch latest news:', error)
  }

  return (
    <>
      {/* Hero — art-directed carousel (portrait on mobile, landscape on desktop),
          bottom-anchored content on mobile, centered on desktop */}
      <section className="relative flex min-h-[560px] items-end overflow-hidden lg:items-center">
        <HeroBackgroundSlideshow
          images={heroImagesMobile}
          priority={false}
          className="lg:hidden"
        />
        <HeroBackgroundSlideshow
          images={heroImagesDesktop}
          priority={false}
          className="hidden lg:block"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,35,42,0.15)_0%,rgba(8,35,42,0.45)_45%,rgba(8,35,42,0.88)_100%)] lg:bg-[linear-gradient(90deg,rgba(8,35,42,0.82)_0%,rgba(8,35,42,0.45)_52%,rgba(8,35,42,0.10)_100%)]" />
        <div className="relative w-full pt-24 pb-8 lg:py-16">
          <div className="container mx-auto max-w-6xl px-6 lg:px-4">
            <div className="flex max-w-[620px] flex-col items-start gap-4 lg:gap-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-[7px] bg-yellow-400/18 text-yellow-300 border border-yellow-400/35 rounded-full text-[11px] sm:text-[13px] font-semibold leading-[1.35]">
                <Trophy className="w-3.5 h-3.5 sm:w-[15px] sm:h-[15px] text-yellow-400 flex-shrink-0" />
                <span>Tim CroSpec – srebrna medalja WRO 2025, Singapur</span>
              </div>

              <h1 className="text-[33px] sm:text-5xl lg:text-[56px] font-extrabold text-white leading-[1.12] lg:leading-[1.08] tracking-[-0.5px] lg:tracking-[-1px]">
                Otkrijte{' '}
                <span className="text-cyan-400">Svijet LEGO Robotike</span>
              </h1>
              <p className="text-[15px] sm:text-lg lg:text-[19px] text-white/82 lg:text-white/85 leading-[1.55] lg:leading-[1.6] max-w-[560px]">
                Učimo djecu od 6 do 14 godina STEM vještine kroz igru, kreativnost i programiranje.
                <span className="hidden sm:inline">
                  {' '}Splitska udruga za robotiku s tradicijom od 2014. godine.
                </span>
              </p>
              <div className="flex w-full flex-col sm:w-auto sm:flex-row gap-4 lg:mt-2">
                <Link
                  href="/upisi"
                  className="inline-flex items-center justify-center gap-2 px-8 py-[15px] sm:py-3.5 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.15)] text-base"
                >
                  Upiši dijete <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/programi"
                  className="hidden sm:inline-flex items-center justify-center px-8 py-3.5 bg-white/15 text-white font-semibold rounded-xl border-2 border-white/30 hover:bg-white/25 hover:border-white/50 transition-colors text-base backdrop-blur-sm"
                >
                  Pogledaj programe
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <StatsSection />
      <CoursesPreview />

      {/* Competitions */}
      <section className="py-16 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 relative overflow-hidden">
        <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10">
          <GearDecor size={180} className="text-white animate-spin-slow" />
        </div>
        <div className="absolute left-6 bottom-4 opacity-10">
          <GearDecor size={80} className="text-white animate-spin-slow-reverse" />
        </div>
        <div className="container mx-auto relative">
          <div className="max-w-4xl mx-auto text-center">
            <Trophy className="w-12 h-12 text-yellow-300 mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
              Upoznajte naše natjecateljske programe
            </h2>
            <p className="text-cyan-100 text-lg mb-8 leading-relaxed max-w-2xl mx-auto">
              Naši najnadareniji polaznici nastupaju na najprestižnijim robotičkim natjecanjima u Hrvatskoj i svijetu.
              Tim CroSpec 2025. godine <strong className="text-white">osvojio srebrnu medalju na WRO finalima u Singapuru</strong>.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {[
                { name: 'FLL', url: 'https://www.firstlegoleague.org/' },
                { name: 'WRO', url: 'https://wro-association.org/' },
                { name: 'NMT', url: 'https://www.hztk.hr/' },
                { name: 'RoboCup', url: 'https://www.robocup.org/' },
              ].map((comp) => (
                <a
                  key={comp.name}
                  href={comp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/20 text-white rounded-full font-medium text-sm hover:bg-white/30 transition-colors"
                >
                  {comp.name} ↗
                </a>
              ))}
            </div>
            <Link
              href="/natjecanja"
              className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-sm"
            >
              Naša natjecanja i rezultati <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <LocationsSection />
      <TestimonialsSection />
      <NewsSection articles={latestNews} />

      {/* CTA */}
      <section className="py-20 px-4 bg-white relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
          <RobotSvg className="w-64 translate-x-8 translate-y-8" />
        </div>
        <div className="container mx-auto text-center max-w-2xl relative">
          <div className="flex justify-center mb-4">
            <RobotHeadSvg className="w-[120px] h-auto" />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Zainteresirani ste?
          </h2>
          <p className="text-gray-500 mb-8 text-lg">
            Ispunite kratku upisnu formu i mi ćemo vas kontaktirati u najkraćem mogućem roku. Bez obaveza.
          </p>
          <Link
            href="/upisi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
          >
            Pošalji upit <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-sm text-gray-400">
            ili nas kontaktirajte na{' '}
            <a href="mailto:upisi@udruga-inovatic.hr" className="text-cyan-500 hover:underline">
              upisi@udruga-inovatic.hr
            </a>
          </p>
        </div>
      </section>
    </>
  )
}
