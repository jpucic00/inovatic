import type { Metadata } from 'next'
import Link from 'next/link'
import { Trophy, ArrowRight } from 'lucide-react'
import { RobotSvg } from '@/components/shared/robot-svg'
import { GearDecor } from '@/components/shared/decorations'
import { HeroCarousel } from '@/components/shared/hero-carousel'
import { db } from '@/lib/db'
import { StatsSection } from '@/components/public/homepage/StatsSection'
import { CoursesPreview } from '@/components/public/homepage/CoursesPreview'
import { LocationsSection } from '@/components/public/homepage/LocationsSection'
import { TestimonialsSection } from '@/components/public/homepage/TestimonialsSection'
import { NewsSection } from '@/components/public/homepage/NewsSection'

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
  tags: { tag: { name: string } }[]
}

export default async function HomePage() {
  let latestNews: LatestNewsArticle[] = []
  try {
    latestNews = await db.article.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { slug: true, title: true, excerpt: true, coverImage: true, publishedAt: true, tags: { select: { tag: { select: { name: true } } } } },
    })
  } catch (error) {
    console.error('Failed to fetch latest news:', error)
  }

  return (
    <>
      {/* Hero */}
      <HeroCarousel
        images={[
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656903/articles/covers/zavrsetak-cjelogodisnje-aktivnosti-2024-2025.jpg', alt: 'Djeca na radionici LEGO robotike' },
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656871/articles/covers/odrzane-zimske-radionice-robotike-2026.jpg', alt: 'Zimske radionice robotike' },
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656863/articles/covers/odrzan-prvi-splitski-kamp-robotike.jpg', alt: 'Splitski kamp robotike' },
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656909/articles/covers/zavrsetak-slr-2023-2024.jpg', alt: 'Završetak SLR programa' },
        ]}
      >
        <div className="text-center lg:text-left max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-yellow-400/25 text-yellow-300 border border-yellow-400/40 rounded-full text-xs sm:text-sm font-semibold mb-8">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400 flex-shrink-0" />
            <span>Tim CroSpec – srebrna medalja WRO 2025, Singapur</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight">
            Otkrijte{' '}
            <span className="text-cyan-400">Svijet LEGO Robotike</span>
          </h1>
          <p className="text-xl text-white/85 mb-10 leading-relaxed max-w-xl mx-auto lg:mx-0">
            Učimo djecu od 6 do 14 godina STEM vještine kroz igru, kreativnost i programiranje.
            Splitska udruga za robotiku s tradicijom od 2014. godine.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link
              href="/upisi"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-cyan-500 text-white font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-md text-base"
            >
              Upiši dijete <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/programi"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white/15 text-white font-semibold rounded-xl border-2 border-white/30 hover:bg-white/25 hover:border-white/50 transition-colors text-base backdrop-blur-sm"
            >
              Pogledaj programe
            </Link>
          </div>
        </div>
      </HeroCarousel>

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
                { name: 'Croatian Makers League', url: 'https://croatianmakers.hr/' },
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-16 h-16" aria-hidden="true">
              <line x1="50" y1="19" x2="43" y2="6" stroke="#AAAAAA" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="41" cy="4" r="5.5" fill="#F5A200"/>
              <circle cx="39" cy="2.5" r="2" fill="#FFD060" opacity="0.75"/>
              <polygon points="11,91 89,91 89,51 50,17 11,51" fill="#4BBDCA"/>
              <polygon points="50,17 89,51 89,91 50,54" fill="#2A9EAD" opacity="0.25"/>
              <polygon points="11,51 50,17 50,54 11,91" fill="white" opacity="0.07"/>
              <rect x="23" y="46" width="22" height="4.5" rx="2.25" fill="#2A8A9A"/>
              <rect x="55" y="46" width="22" height="4.5" rx="2.25" fill="#2A8A9A"/>
              <circle cx="34" cy="67" r="13.5" fill="#F5C018"/>
              <circle cx="66" cy="67" r="13.5" fill="#F5C018"/>
              <circle cx="34" cy="67" r="8.5" fill="#E88200"/>
              <circle cx="66" cy="67" r="8.5" fill="#E88200"/>
              <circle cx="29" cy="62" r="3.5" fill="white" opacity="0.65"/>
              <circle cx="61" cy="62" r="3.5" fill="white" opacity="0.65"/>
            </svg>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Zainteresirani ste?
          </h2>
          <p className="text-gray-500 mb-8 text-lg">
            Ispunite kratku prijavu i mi ćemo vas kontaktirati s raspoloživim terminima. Bez obaveza.
          </p>
          <Link
            href="/upisi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
          >
            Pošalji upit <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-sm text-gray-400">
            ili nas kontaktirajte na{' '}
            <a href="mailto:prijave@udruga-inovatic.hr" className="text-cyan-500 hover:underline">
              prijave@udruga-inovatic.hr
            </a>
          </p>
        </div>
      </section>
    </>
  )
}
