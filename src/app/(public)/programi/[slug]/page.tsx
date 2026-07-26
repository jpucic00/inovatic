import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  FileText,
  Images,
  LogIn,
  Sparkles,
} from 'lucide-react'
import { courses, getCourseBySlug } from '@/lib/courses-data'
import { CourseModuleAccordion } from '@/components/public/course-module-accordion'
import { CourseStickyCta } from '@/components/public/course-sticky-cta'
import { CourseHero } from '@/components/public/course-hero'

export function generateStaticParams() {
  return courses.map((c) => ({ slug: c.slug }))
}

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const course = getCourseBySlug(slug)
  if (!course) return { title: 'Program nije pronađen' }
  const desc = `${course.subtitle} – za djecu od ${course.ageMin} do ${course.ageMax} godina. ${course.equipment}. Cijena: ${course.priceYear} EUR/god.`
  return {
    title: course.title,
    description: desc,
    openGraph: {
      title: `${course.title} | Inovatic`,
      description: desc,
      url: `https://udruga-inovatic.hr/programi/${slug}`,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${course.title} | Inovatic` }],
    },
    alternates: { canonical: `https://udruga-inovatic.hr/programi/${slug}` },
  }
}

function ProbniSatCallout({ className = '' }: { readonly className?: string }) {
  return (
    <div className={`flex items-start gap-4 rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-yellow-50 p-5 ${className}`}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-bold text-gray-900">Probni sat</h3>
        <p className="mt-1 text-sm text-gray-600 leading-relaxed">
          Prije upisa vaše dijete može doći na probni sat i isprobati program — bez obveze. Za dogovor termina slobodno nam se javite.
        </p>
      </div>
    </div>
  )
}

const PLATFORM_FEATURES = [
  {
    icon: FileText,
    title: 'Materijali',
    description:
      'Upute za slaganje, prezentacije i video zapisi za svaki modul programa. Dostupni su cijelu godinu, pa dijete može ponoviti projekt i kod kuće.',
  },
  {
    icon: Images,
    title: 'Galerija fotografija',
    description:
      'Fotografije s radionica vaše grupe, razvrstane po modulima. Možete ih pregledati i preuzeti.',
  },
  {
    icon: ClipboardCheck,
    title: 'Evaluacija polaznika',
    description:
      'Ocjena mentora po šest vještina — slaganje, programiranje, inovacije, suradnja, komunikacija i zabava — uz opisnu ocjenu i preporuku za sljedeću razinu.',
  },
] as const

function OnlinePlatformSection() {
  return (
    <>
      <h2 className="mb-2.5 mt-8 text-lg font-bold text-gray-900 md:mb-4 md:mt-11 md:text-[22px]">
        Online platforma za roditelje i polaznike
      </h2>
      <p className="mb-4 text-sm leading-[1.65] text-gray-600 md:mb-5 md:text-[15.5px] md:leading-[1.7]">
        Nakon upisa svaki polaznik dobiva svoje pristupne podatke. Roditelji se
        prijavljuju istim podacima i u svakom trenutku mogu pratiti što dijete
        radi na radionicama.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLATFORM_FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-gray-100 bg-gray-50 p-5"
          >
            <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500 text-white">
              <feature.icon className="h-[18px] w-[18px]" />
            </div>
            <h3 className="mb-1.5 text-sm font-bold text-gray-900">{feature.title}</h3>
            <p className="text-[13px] leading-[1.6] text-gray-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <Link
        href="/prijava"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-colors hover:text-cyan-700"
      >
        <LogIn className="h-4 w-4" />
        Polaznički portal
      </Link>
    </>
  )
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { slug } = await params
  const course = getCourseBySlug(slug)
  if (!course) notFound()

  const courseIndex = courses.findIndex((c) => c.slug === slug)
  const nextCourse = courses[courseIndex + 1]

  const includedItems = [
    `Nastava jednom tjedno, ${course.sessionDuration} minuta`,
    `Korištenje opreme (${course.equipment} + laptop)`,
    `Alati: ${course.tools}`,
    'Mala grupa (do 12 polaznika)',
    'Stručni robo treneri',
    'Diploma o završetku',
    'Pristup online platformi',
    'Probni sat bez obveze',
  ]

  const courseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.description,
    url: `https://udruga-inovatic.hr/programi/${slug}`,
    provider: {
      '@type': 'EducationalOrganization',
      name: 'Udruga za robotiku "Inovatic"',
      url: 'https://udruga-inovatic.hr',
    },
    educationalLevel: `Razina ${courseIndex + 1} od 4`,
    typicalAgeRange: `${course.ageMin}-${course.ageMax}`,
    teaches: course.equipment,
    courseMode: 'onsite',
    inLanguage: 'hr',
    offers: {
      '@type': 'Offer',
      price: course.priceYear,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      validFrom: '2025-10-01',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
      />

      <CourseHero course={course} level={courseIndex + 1} />

      {/* Single reading column */}
      <div className="mx-auto max-w-[768px] px-5 pb-12 pt-5 md:px-6 md:pb-14 md:pt-10">
        <ProbniSatCallout className="mb-6 md:mb-10" />

        <h2 className="mb-2.5 text-lg font-bold text-gray-900 md:mb-4 md:text-[22px]">O programu</h2>
        {course.description.split('\n').filter(Boolean).map((para) => (
          <p
            key={para.slice(0, 40)}
            className="mb-2.5 text-sm leading-[1.65] text-gray-600 last:mb-0 md:mb-3.5 md:text-[15.5px] md:leading-[1.7]"
          >
            {para}
          </p>
        ))}

        <h2 className="mb-3 mt-8 text-lg font-bold text-gray-900 md:mb-5 md:mt-11 md:text-[22px]">Moduli programa</h2>
        <CourseModuleAccordion modules={course.modules} gradient={course.gradient} />

        <h2 className="mb-3 mt-8 text-lg font-bold text-gray-900 md:mb-5 md:mt-11 md:text-[22px]">Što je uključeno</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {includedItems.map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-cyan-500" />
              <span className="text-sm text-gray-600">{item}</span>
            </div>
          ))}
        </div>

        <OnlinePlatformSection />
      </div>

      {/* Pricing band — full-width, in flow */}
      <section
        id="cijene"
        className="scroll-mt-20 border-t border-cyan-100 bg-gradient-to-b from-cyan-50 to-white px-5 pb-6 pt-6 md:px-6 md:pb-14 md:pt-12"
      >
        <div className="mx-auto max-w-[768px]">
          <h2 className="mb-1 text-center text-lg font-bold text-gray-900 md:mb-1.5 md:text-[22px]">Cijene i upis</h2>
          <p className="mb-4 text-center text-[12.5px] text-gray-500 md:mb-7 md:text-sm">
            Popust 10% za drugu i svaku sljedeću prijavu iz iste obitelji.
          </p>

          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {/* Po modulu — left on desktop, second on mobile */}
            <div className="order-2 flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 md:order-1 md:px-6 md:py-[22px]">
              <div>
                <div className="text-sm font-bold text-gray-900 md:text-[15px]">Po modulu</div>
                <div className="text-xs text-gray-500 md:text-[13px]">7 radionica</div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-extrabold text-gray-700 md:text-[28px]">{course.priceModule} EUR</div>
                <div className="hidden text-xs font-medium text-gray-400 md:block">/ modul</div>
              </div>
            </div>
            {/* Godišnja pretplata — right on desktop, first on mobile */}
            <div className="relative order-1 mt-2 flex items-center justify-between gap-4 rounded-2xl border-2 border-cyan-500 bg-white p-4 md:order-2 md:mt-0 md:px-6 md:py-[22px]">
              <span className="absolute -top-2.5 left-3.5 rounded-full bg-yellow-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-gray-900 md:-top-[11px] md:left-5 md:text-[11px]">
                Najpovoljnije
              </span>
              <div>
                <div className="text-sm font-bold text-gray-900 md:text-[15px]">Godišnja pretplata</div>
                <div className="text-xs text-gray-500 md:text-[13px]">Sva 4 modula · {course.hours} {course.hoursUnit ?? 'sati'}</div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-extrabold text-cyan-600 md:text-[28px]">{course.priceYear} EUR</div>
                <div className="hidden text-xs font-medium text-gray-400 md:block">/ godina</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 md:flex-row md:justify-center md:gap-3">
            <Link
              href="/upisi"
              className="rounded-xl bg-cyan-500 px-8 py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-cyan-600 md:text-[15px]"
            >
              Pošalji prijavu za upis
            </Link>
            <a
              href="mailto:prijave@udruga-inovatic.hr"
              className="rounded-xl border border-cyan-200 bg-white px-8 py-3.5 text-center text-sm font-semibold text-cyan-600 transition-colors hover:bg-cyan-50 md:text-[15px]"
            >
              Kontaktiraj nas emailom
            </a>
          </div>
        </div>
      </section>

      {/* Next course */}
      {nextCourse && (
        <div className="mx-auto max-w-[768px] px-5 pb-7 pt-5 md:px-6 md:pb-12 md:pt-8">
          <p className="mb-3 text-sm font-medium text-gray-500">Sljedeća razina</p>
          <Link
            href={`/programi/${nextCourse.slug}`}
            className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-5 transition-all hover:border-cyan-300 hover:bg-cyan-50"
          >
            <div>
              <div className="font-bold text-gray-900">{nextCourse.title}</div>
              <div className="text-sm text-gray-500">{nextCourse.ageMin}–{nextCourse.ageMax} god. | {nextCourse.equipment}</div>
            </div>
            <ArrowRight className="h-5 w-5 text-cyan-500 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )}

      {/* Mobile sticky CTA bar — hides once the pricing band is in view */}
      <CourseStickyCta priceYear={course.priceYear} priceModule={course.priceModule} targetId="cijene" />
    </>
  )
}
