import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import { OG_DEFAULTS } from '@/lib/seo'
import { getActivePrograms } from '@/actions/public/programs'
import { buildPublicSchedule } from '@/lib/public-schedule'
import { CITY_LABELS, CITY_VALUES, cityFromSlug, citySlug } from '@/lib/city'
import { PublicScheduleView } from '@/components/public/schedule/public-schedule-view'

// Spots are reserved the moment an upit is filed, so the page must read the
// live feed on every request — the same freshness `/prijava` has.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Raspored i slobodna mjesta',
  description:
    'Termini LEGO robotike za djecu u Splitu i Šibeniku s brojem slobodnih mjesta po programu. Provjerite raspored prije prijave – prijava ne obvezuje.',
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Raspored i slobodna mjesta | Inovatic',
    description:
      'Termini LEGO robotike za djecu u Splitu i Šibeniku s brojem slobodnih mjesta po programu.',
    url: 'https://udruga-inovatic.hr/raspored',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – raspored' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/raspored' },
}

type PageProps = Readonly<{ searchParams: Promise<{ grad?: string }> }>

/** Split is the bare `/raspored`; any other city rides on `?grad=` like novosti. */
function scheduleHref(city: (typeof CITY_VALUES)[number]): string {
  return city === 'SPLIT' ? '/raspored' : `/raspored?grad=${citySlug(city)}`
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { grad } = await searchParams
  const city = cityFromSlug(grad) ?? 'SPLIT'
  const cityLabel = CITY_LABELS[city]
  const schedule = buildPublicSchedule(await getActivePrograms(city))

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-cyan-50 via-white to-blue-50 px-4 py-12 md:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-cyan-300 opacity-40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-12 h-56 w-56 rounded-full bg-yellow-200 opacity-40 blur-3xl" />
        <div className="container relative mx-auto max-w-3xl text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-cyan-500">Raspored</span>
          <h1 className="mb-4 text-4xl font-extrabold text-gray-900 md:text-5xl">Raspored i slobodna mjesta</h1>
          <p className="text-lg leading-relaxed text-gray-600">
            Termini na koje se trenutno možete prijaviti. Broj slobodnih mjesta aktualan je u trenutku
            otvaranja stranice, a prijava ne obvezuje.
          </p>

          <nav aria-label="Grad" className="mt-6 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/70 p-1 shadow-sm backdrop-blur">
            {CITY_VALUES.map((c) => (
              <Link
                key={c}
                href={scheduleHref(c)}
                aria-current={c === city ? 'page' : undefined}
                className={
                  c === city
                    ? 'rounded-full bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm'
                    : 'rounded-full px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-cyan-600'
                }
              >
                {CITY_LABELS[c]}
              </Link>
            ))}
          </nav>

          {schedule.venues.length === 1 && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-cyan-500" aria-hidden="true" />
              {schedule.venues[0]}
            </p>
          )}
        </div>
      </section>

      <section className="bg-white px-4 py-10 md:py-14">
        <div className="container mx-auto max-w-6xl">
          <PublicScheduleView schedule={schedule} cityLabel={cityLabel} />
        </div>
      </section>

      <section className="bg-white px-4 pb-16">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col items-start gap-4 rounded-2xl bg-gray-900 px-6 py-7 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="text-xl font-extrabold text-white">Odabrali ste termin?</p>
              <p className="mt-1 text-sm text-gray-300">
                Termin birate u prijavi – mjesto je rezervirano čim zaprimimo vaš upit.
              </p>
            </div>
            <Link
              href="/prijava"
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-6 py-3.5 text-[15px] font-bold text-gray-900 shadow-md transition-colors hover:bg-yellow-300"
            >
              Prijavi dijete <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
