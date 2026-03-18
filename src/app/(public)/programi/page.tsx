import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Clock, Users, Calendar, Wrench, Euro } from 'lucide-react'
import { courses } from '@/lib/courses-data'
import { GearDecor, StarDecor } from '@/components/shared/decorations'

export const metadata: Metadata = {
  title: 'Programi',
  description:
    'Sva 4 razine tečajeva LEGO robotike – Svijet LEGO Robotike 1–4. Programi za djecu od 6 do 14 godina u Splitu.',
  openGraph: {
    title: 'Programi – Svijet LEGO Robotike | Inovatic',
    description: 'Sva 4 razine tečajeva LEGO robotike za djecu od 6 do 14 godina u Splitu.',
    url: 'https://udruga-inovatic.hr/programi',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/programi' },
}

const coursesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Tečajevi LEGO robotike – Inovatic',
  description: 'Četiri razine tečajeva LEGO robotike za djecu od 6 do 14 godina u Splitu.',
  url: 'https://udruga-inovatic.hr/programi',
  numberOfItems: 4,
  itemListElement: courses.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.title,
    url: `https://udruga-inovatic.hr/programi/${c.slug}`,
    description: `${c.subtitle} – za djecu od ${c.ageMin} do ${c.ageMax} godina.`,
  })),
}

const cardBorders = [
  'border-l-cyan-400',
  'border-l-blue-400',
  'border-l-indigo-400',
  'border-l-purple-400',
]

export default function ProgramiPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(coursesJsonLd) }}
      />
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden">
        {/* Blob decorations */}
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-cyan-400 rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-yellow-300 rounded-full blur-3xl opacity-40 pointer-events-none" />
        {/* Gear decoration */}
        <GearDecor
          size={48}
          className="absolute bottom-6 right-8 text-cyan-200 opacity-60 pointer-events-none"
        />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
            Programi
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            Svijet LEGO Robotike
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Četiri razine tečajeva prilagođene dobi i predznanju djeteta. Od prvih koraka u
            mehanici do simulacije industrijskih sustava – kontinuirani razvojni put od 6 do 14 godina.
          </p>
        </div>
      </section>

      {/* Info bar */}
      <section className="bg-cyan-50 border-b border-cyan-100 py-5 px-4">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-500" />
              <span>56 sati nastave godišnje</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-500" />
              <span>Do 8 polaznika po grupi</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-500" />
              <span>Listopad – Svibanj</span>
            </div>
            <div className="flex items-center gap-2">
              <Euro className="w-4 h-4 text-cyan-500" />
              <span>400 EUR/god. ili 110 EUR/modul</span>
            </div>
          </div>
        </div>
      </section>

      {/* Course cards */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="space-y-8">
            {courses.map((course, i) => (
              <div
                key={course.slug}
                className={`group bg-white rounded-2xl border border-gray-100 border-l-4 ${cardBorders[i]} overflow-hidden shadow-sm hover:shadow-md hover:shadow-cyan-100 transition-shadow`}
              >
                <div className="md:flex">
                  {/* Cover image */}
                  <div className={`relative md:w-56 h-44 md:h-auto flex-shrink-0 overflow-hidden bg-gradient-to-br ${course.gradient}`}>
                    <Image
                      src={course.coverImage}
                      alt={course.title}
                      fill
                      className="object-cover object-center scale-90 origin-center"
                      sizes="(max-width: 768px) 100vw, 224px"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent md:bg-gradient-to-t md:from-black/50 md:via-black/10 md:to-transparent flex items-end justify-start p-3">
                      <div className="text-white drop-shadow">
                        <div className="text-2xl font-extrabold leading-none">SLR {i + 1}</div>
                        <div className="text-xs font-medium opacity-90">
                          {course.ageMin}–{course.ageMax} god.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 md:p-8 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{course.title}</h2>
                        <p className="text-cyan-600 font-medium text-sm mt-0.5">{course.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                        <Euro className="w-3.5 h-3.5" />
                        400 / god.
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm leading-relaxed mb-5 line-clamp-2">
                      {course.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full border border-cyan-100">
                        <Wrench className="w-3 h-3" /> {course.equipment}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full border border-cyan-100">
                        <Users className="w-3 h-3" /> do {course.groupSize} polaznika
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full border border-cyan-100">
                        <Clock className="w-3 h-3" /> {course.hours}h / {course.sessionDuration} min tjedno
                      </span>
                    </div>

                    {/* Modules preview */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {course.modules.map((mod) => (
                        <span
                          key={mod.title}
                          className="text-xs px-2.5 py-1 bg-cyan-50 border border-cyan-100 text-cyan-700 rounded-lg"
                        >
                          {mod.title.split('–')[0].trim()}
                        </span>
                      ))}
                    </div>

                    <Link
                      href={`/programi/${course.slug}`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-sm"
                    >
                      Saznaj više <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 bg-yellow-50">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">Cijene</h2>
            <p className="text-gray-500">Sve razine programa imaju jednaku cijenu.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-7 border border-yellow-200 shadow-sm text-center">
              <div className="text-4xl font-extrabold text-yellow-500 mb-1">110 EUR</div>
              <div className="text-gray-700 font-semibold mb-2">po modulu</div>
              <p className="text-sm text-gray-500">
                Idealno za isprobavanje. Jedan modul traje 14 školskih sati (otprilike 7 tjedana).
              </p>
            </div>
            <div className="bg-cyan-500 rounded-2xl p-7 border border-cyan-500 shadow-sm text-center relative overflow-hidden">
              <div className="absolute top-3 right-3">
                <span className="text-xs bg-yellow-400 text-gray-900 font-bold px-2.5 py-1 rounded-full">
                  Najpovoljnije
                </span>
              </div>
              <div className="text-4xl font-extrabold text-white mb-1">400 EUR</div>
              <div className="text-cyan-100 font-semibold mb-2">godišnja pretplata</div>
              <p className="text-sm text-cyan-100">
                Sva 4 modula kroz školsku godinu. Uštedite 40 EUR u usporedbi s plaćanjem modula zasebno.
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 mt-5">
            Popust za brata/sestru: <strong>10%</strong> na drugu i svaku sljedeću prijavu iz iste obitelji.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto text-center max-w-xl relative">
          <StarDecor
            size={36}
            className="absolute -top-2 right-4 text-yellow-300 opacity-70 pointer-events-none"
          />
          <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Nije sigurni koji program odabrati?</h2>
          <p className="text-gray-500 mb-6">
            Ispunite upit i mi ćemo na temelju dobi i iskustva vašeg djeteta preporučiti odgovarajući razred.
          </p>
          <Link
            href="/upisi"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-500 transition-colors shadow-sm"
          >
            Pošalji upit <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
