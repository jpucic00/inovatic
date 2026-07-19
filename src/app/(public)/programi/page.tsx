import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { courses } from '@/lib/courses-data'

export const metadata: Metadata = {
  title: 'Programi',
  description:
    'Sva 4 razine tečajeva LEGO robotike – Svijet LEGO Robotike 1–4. Programi za djecu od 6 do 14 godina u Splitu i Šibeniku.',
  openGraph: {
    title: 'Programi – Svijet LEGO Robotike | Inovatic',
    description: 'Sva 4 razine tečajeva LEGO robotike za djecu od 6 do 14 godina u Splitu i Šibeniku.',
    url: 'https://udruga-inovatic.hr/programi',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu i Šibeniku' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/programi' },
}

const coursesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Tečajevi LEGO robotike – Inovatic',
  description: 'Četiri razine tečajeva LEGO robotike za djecu od 6 do 14 godina u Splitu i Šibeniku.',
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

const quickFacts = [
  { value: '28 radionica', label: 'godišnje' },
  { value: 'Do 10', label: 'polaznika po grupi' },
  { value: 'Listopad – Svibanj', label: 'trajanje programa' },
  { value: '400 EUR/god.', label: 'ili 110 EUR/modul' },
]

// Abbreviations like "(3. i 4. razred)" contain ". " — a sentence only ends
// where the period is followed by an uppercase letter.
function firstSentence(text: string): string {
  const firstParagraph = text.split('\n\n')[0]
  const end = /\.(?=\s+[A-ZČĆĐŠŽ])/.exec(firstParagraph)
  return end ? firstParagraph.slice(0, end.index + 1) : firstParagraph
}

export default function ProgramiPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(coursesJsonLd) }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50">
        {/* Blob decorations */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-[200px] w-[200px] rounded-full bg-cyan-400 opacity-40 blur-3xl md:h-72 md:w-72" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-[180px] w-[180px] rounded-full bg-yellow-300 opacity-40 blur-3xl md:h-64 md:w-64" />
        <div className="relative mx-auto max-w-7xl px-6 pt-14 pb-10 text-center md:grid md:grid-cols-[1fr_240px] md:items-start md:gap-10 md:px-10 md:pt-20 md:pb-16 md:text-left lg:grid-cols-[1fr_280px] lg:gap-16 lg:px-24">
          <div>
            <span className="mb-3 inline-block text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-600 md:mb-4 md:text-xs">
              Jedinstveni kurikulum
            </span>
            <h1 className="mb-4 text-[34px] font-extrabold leading-[1.12] tracking-[-0.02em] text-gray-900 md:mb-5 md:text-[52px] md:leading-[1.08]">
              Svijet <span className="text-cyan-600">LEGO</span> Robotike
            </h1>
            <p className="text-[15.5px] leading-[1.65] text-gray-600 md:max-w-[620px] md:text-lg">
              Omogućite svom djetetu da ne bude samo korisnik tehnologije, već njezin kreator. Od prvog robota do
              vlastitih tehnoloških rješenja – kroz igru, kreativnost i praktičan rad gradimo znanje, samopouzdanje i
              ljubav prema tehnologiji.
            </p>
          </div>
          {/* Quick facts */}
          <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-4 text-left md:mt-3 md:flex md:flex-col md:gap-[18px] md:border-l-2 md:border-cyan-200 md:pl-7">
            {quickFacts.map((fact) => (
              <div key={fact.label} className="border-l-2 border-cyan-200 pl-3.5 md:border-l-0 md:pl-0">
                <div className="text-[17px] font-extrabold text-gray-900 md:text-xl">{fact.value}</div>
                <div className="text-[12.5px] text-gray-500 md:text-[13px]">{fact.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Course rows */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 pt-2 pb-12 md:px-10 md:pt-12 md:pb-18 lg:px-24">
          <div className="divide-y divide-gray-200">
            {courses.map((course, i) => (
              <article
                key={course.slug}
                className="grid grid-cols-[auto_1fr] gap-x-3.5 py-9 last:pb-0 md:grid-cols-[110px_1fr_240px] md:gap-x-10 md:py-10 lg:grid-cols-[110px_1fr_300px]"
              >
                <div className="col-start-1 row-start-1 mb-3.5 self-baseline text-[38px] font-extrabold leading-none text-cyan-200 md:row-span-6 md:mb-0 md:self-center md:text-[56px]">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h2 className="col-start-2 row-start-1 mb-3.5 self-baseline text-[21px] font-extrabold text-gray-900 md:row-start-2 md:mb-2.5 md:self-auto md:text-2xl">
                  {course.title}
                </h2>
                <Link
                  href={`/programi/${course.slug}`}
                  aria-label={course.title}
                  className="group relative col-span-2 col-start-1 row-start-2 mb-4 block h-[190px] overflow-hidden rounded-[6px] md:col-span-1 md:col-start-3 md:row-span-6 md:row-start-1 md:mb-0 md:self-center"
                >
                  <Image
                    src={course.coverImage}
                    alt={course.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 300px"
                  />
                </Link>
                <div className="col-span-2 col-start-1 row-start-3 mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-cyan-600 md:col-span-1 md:col-start-2 md:row-start-1 md:text-xs md:tracking-[0.1em]">
                  {course.subtitle}
                </div>
                <p className="col-span-2 col-start-1 row-start-4 mb-3 text-[14.5px] leading-[1.6] text-gray-500 md:col-span-1 md:col-start-2 md:row-start-3 md:mb-3.5 md:max-w-[560px] md:text-[15px]">
                  {firstSentence(course.description)}
                </p>
                <div className="col-span-2 col-start-1 row-start-5 mb-3 md:col-span-1 md:col-start-2 md:row-start-4 md:mb-2.5">
                  <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-gray-400">Moduli</div>
                  <div className="flex flex-wrap gap-2">
                    {course.modules.map((mod) => (
                      <span
                        key={mod.title}
                        className="rounded-[6px] border border-cyan-100 bg-cyan-50 px-[11px] py-[5px] text-[12.5px] font-medium text-cyan-800"
                      >
                        {mod.title}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 col-start-1 row-start-6 mb-3.5 text-[13px] text-gray-400 md:col-span-1 md:col-start-2 md:row-start-5 md:mb-4 md:text-[13.5px]">
                  {course.equipment} · {course.tools}
                </div>
                <Link
                  href={`/programi/${course.slug}`}
                  className="col-span-2 col-start-1 row-start-7 inline-flex items-center gap-1.5 justify-self-start py-1.5 text-sm font-semibold text-cyan-600 transition-colors hover:text-cyan-700 md:col-span-1 md:col-start-2 md:row-start-6 md:py-0"
                >
                  Saznaj više <ArrowRight className="h-[15px] w-[15px]" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-gray-100 bg-gray-50 px-6 py-12 md:px-10 md:py-16 lg:px-24">
        <div className="mx-auto max-w-[860px]">
          <h2 className="mb-1.5 text-center text-2xl font-extrabold text-gray-900 md:text-[28px]">Cijene</h2>
          <p className="mb-6 text-center text-[14.5px] text-gray-500 md:mb-8 md:text-[15px]">
            Sve razine programa imaju jednaku cijenu.
          </p>
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-0">
            <div className="rounded-[12px] border border-gray-200 bg-white p-7 md:rounded-r-none md:border-r-0 md:px-10 md:py-9">
              <div className="text-[30px] font-extrabold text-gray-900 md:text-4xl">110 EUR</div>
              <div className="mt-1 mb-2.5 text-sm font-semibold text-gray-500 md:mb-3">po modulu</div>
              <p className="text-sm leading-[1.6] text-gray-500">
                Idealno za isprobavanje. Jedan modul traje 7 sati (kroz 7 tjedana).
              </p>
            </div>
            <div className="relative rounded-[12px] border border-gray-200 bg-white p-7 md:rounded-l-none md:px-10 md:py-9">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[30px] font-extrabold text-cyan-600 md:text-4xl">400 EUR</div>
                <span className="shrink-0 rounded-full bg-yellow-400 px-2.5 py-1 text-[11px] font-bold text-gray-900 md:absolute md:top-5 md:right-5">
                  Najpovoljnije
                </span>
              </div>
              <div className="mt-1 mb-2.5 text-sm font-semibold text-gray-500 md:mb-3">godišnja pretplata</div>
              <p className="text-sm leading-[1.6] text-gray-500">
                Sva 4 modula kroz školsku godinu. Uštedite 40 EUR u usporedbi s plaćanjem modula zasebno.
              </p>
            </div>
          </div>
          <p className="mt-5 text-center text-[13.5px] leading-[1.6] text-gray-500 md:text-sm">
            Popust za brata/sestru: <strong className="text-gray-900">10%</strong> na drugu i svaku sljedeću prijavu iz
            iste obitelji.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-12 text-center md:px-10 md:py-16 lg:px-24">
        <h2 className="mb-3 text-[22px] font-extrabold text-white md:text-[26px]">
          Niste sigurni koji program odabrati?
        </h2>
        <p className="mx-auto mb-6 max-w-[520px] text-[14.5px] leading-[1.65] text-cyan-100 md:mb-7 md:text-[15px] md:leading-[1.6]">
          Zainteresirani ste? Provjerite slobodne termine i osigurajte svom djetetu mjesto u jednom od naših programa –
          korak bliže zabavi, učenju i stvaranju!
        </p>
        <Link
          href="/upisi"
          className="inline-flex w-full max-w-[280px] items-center justify-center gap-2 rounded-[12px] bg-yellow-400 px-8 py-3.5 text-[15px] font-bold text-gray-900 transition-colors hover:bg-yellow-500 md:w-auto md:max-w-none md:text-base"
        >
          Pošalji upit <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  )
}
