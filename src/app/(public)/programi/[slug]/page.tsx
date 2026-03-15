import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Clock, Users, Calendar, Wrench, CheckCircle, Euro } from 'lucide-react'
import { courses, getCourseBySlug } from '@/lib/courses-data'

export function generateStaticParams() {
  return courses.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
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
    },
    alternates: { canonical: `https://udruga-inovatic.hr/programi/${slug}` },
  }
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const course = getCourseBySlug(slug)
  if (!course) notFound()

  const courseIndex = courses.findIndex((c) => c.slug === slug)
  const nextCourse = courses[courseIndex + 1]

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
      {/* Header */}
      <section className={`bg-gradient-to-br ${course.gradient} py-16 px-4`}>
        <div className="container mx-auto max-w-4xl">
          <Link
            href="/programi"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Svi programi
          </Link>
          <div>
            <span className="text-white/70 text-sm font-semibold uppercase tracking-widest">
              Razina {courseIndex + 1} od 4
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mt-1 leading-tight">
              {course.title}
            </h1>
            <p className="text-white/90 text-lg mt-2">{course.subtitle}</p>
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="bg-white border-b border-gray-100 py-5 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-500" />
              <span>Dob: <strong className="text-gray-800">{course.ageMin}–{course.ageMax} godina</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-cyan-500" />
              <span>Oprema: <strong className="text-gray-800">{course.equipment}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-500" />
              <span><strong className="text-gray-800">{course.hours} sati</strong> godišnje</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-500" />
              <span><strong className="text-gray-800">{course.season}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Euro className="w-4 h-4 text-cyan-500" />
              <span><strong className="text-gray-800">{course.priceYear} EUR</strong> / god.</span>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-4xl px-4 py-12">
        <div className="grid lg:grid-cols-3 gap-10">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-10">
            {/* Description */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">O programu</h2>
              {course.description.split('\n').filter(Boolean).map((para, i) => (
                <p key={i} className="text-gray-600 leading-relaxed mb-3 last:mb-0">
                  {para}
                </p>
              ))}
            </div>

            {/* Modules */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-5">Moduli programa</h2>
              <div className="space-y-4">
                {course.modules.map((mod, i) => (
                  <div
                    key={mod.title}
                    className="flex gap-4 p-5 rounded-xl border border-gray-100 bg-gray-50 hover:border-cyan-200 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br ${course.gradient} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1 text-sm">{mod.title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{mod.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What's included */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-5">Što je uključeno</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  'Nastava jednom tjedno, 90 minuta',
                  `Korištenje opreme (${course.equipment})`,
                  'Mala grupa (do 8 polaznika)',
                  'Stručni instruktori',
                  'Certifikat o završetku',
                  'Pristup materijalima',
                  'Priprema za natjecanja',
                  'Završna prezentacija projekta',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <CheckCircle className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                    <span className="text-sm text-gray-600">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            {/* Pricing card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">Cijene</h3>
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">Godišnja pretplata</div>
                    <div className="text-xs text-gray-400">Sva 4 modula</div>
                  </div>
                  <div className="text-xl font-extrabold text-cyan-500">{course.priceYear} EUR</div>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">Po modulu</div>
                    <div className="text-xs text-gray-400">14 školskih sati</div>
                  </div>
                  <div className="text-xl font-extrabold text-gray-700">{course.priceModule} EUR</div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                Popust 10% za drugu i svaku sljedeću prijavu iz iste obitelji.
              </p>
              <Link
                href="/upisi"
                className="block w-full text-center px-5 py-3 bg-cyan-500 text-white font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-sm text-sm"
              >
                Pošalji upit za upis
              </Link>
              <a
                href="mailto:prijave@udruga-inovatic.hr"
                className="block w-full text-center px-5 py-3 mt-3 text-cyan-600 font-semibold rounded-xl hover:bg-cyan-50 transition-colors text-sm border border-cyan-200"
              >
                Kontaktiraj nas emailom
              </a>
            </div>

            {/* Course details */}
            <div className="bg-gray-50 rounded-2xl p-5 text-sm space-y-3">
              <h3 className="font-bold text-gray-900 mb-3">Detalji programa</h3>
              {[
                ['Dob', `${course.ageMin}–${course.ageMax} god.`],
                ['Oprema', course.equipment],
                ['Trajanje sata', `${course.sessionDuration} min`],
                ['Učestalost', course.sessionFrequency],
                ['Sezona', course.season],
                ['Broj modula', '4'],
                ['Ukupno sati', `${course.hours}h`],
                ['Veličina grupe', `do ${course.groupSize} pol.`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Next course */}
        {nextCourse && (
          <div className="mt-12 pt-10 border-t border-gray-100">
            <p className="text-sm text-gray-500 mb-3 font-medium">Sljedeća razina</p>
            <Link
              href={`/programi/${nextCourse.slug}`}
              className="group flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-all"
            >
              <div>
                <div className="font-bold text-gray-900">{nextCourse.title}</div>
                <div className="text-sm text-gray-500">{nextCourse.ageMin}–{nextCourse.ageMax} god. | {nextCourse.equipment}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-cyan-500 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
