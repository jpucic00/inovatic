import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { CITIES, LOCATIONS } from '@/lib/locations'

export const metadata: Metadata = {
  title: 'Lokacije',
  description:
    'Lokacije Udruge Inovatic: Split (Velebitska 32 i Ruđera Boškovića 33 / PMF) i Šibenik (Trokut inkubator). Odaberite grad za kontakt, adresu i kartu.',
  openGraph: {
    title: 'Lokacije – Udruga Inovatic',
    description: 'LEGO robotika za djecu u Splitu i Šibeniku. Odaberite lokaciju za kontakt i kartu.',
    url: 'https://udruga-inovatic.hr/lokacije',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – lokacije u Splitu i Šibeniku' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/lokacije' },
}

export default function LocationsOverviewPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden relative">
        <div aria-hidden="true" className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-cyan-300 blur-3xl opacity-40 pointer-events-none" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-12 w-56 h-56 rounded-full bg-yellow-200 blur-3xl opacity-40 pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Lokacije</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Pronađite nas</h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Održavamo nastavu u Splitu i Šibeniku. Odaberite grad za kontakt, adresu i kartu lokacija.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-8">
            {CITIES.map((c) => {
              const city = LOCATIONS[c.slug]
              const cover = city.venues[0]
              const isNew = city.venues.some((v) => v.badge === 'Novo')
              return (
                <Link
                  key={c.slug}
                  href={`/lokacije/${c.slug}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow bg-white"
                >
                  <div className="relative aspect-[16/10] bg-gray-100">
                    <Image
                      src={cover.image}
                      alt={cover.imageAlt}
                      fill
                      sizes="(max-width: 768px) 100vw, 480px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {isNew && (
                      <span className="absolute top-3 right-3 text-[11px] font-extrabold uppercase tracking-wider text-yellow-950 bg-yellow-400 rounded-full px-3 py-1 shadow-sm">
                        Novo
                      </span>
                    )}
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <h2 className="text-2xl font-extrabold text-gray-900 mb-3">{city.label}</h2>
                    <ul className="space-y-2 mb-5">
                      {city.venues.map((v) => (
                        <li key={v.name} className="flex items-start gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                          <span>
                            <span className="font-medium text-gray-800">{v.name}</span>
                            <span className="text-gray-400"> · {v.postal}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-cyan-600 group-hover:gap-3 transition-all">
                      Kontakt i karta <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
