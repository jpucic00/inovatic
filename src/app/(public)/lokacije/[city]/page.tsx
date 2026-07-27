import type { Metadata } from 'next'
import { OG_DEFAULTS } from '@/lib/seo'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Mail, Phone, MapPin, Clock, ArrowRight, ArrowLeft, User, ExternalLink } from 'lucide-react'
import { FacebookIcon, InstagramIcon } from '@/components/shared/social-icons'
import { CITIES, SHARED_EMAILS, getCity } from '@/lib/locations'

type PageProps = Readonly<{ params: Promise<{ city: string }> }>

export function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: slug } = await params
  const city = getCity(slug)
  if (!city) return { title: 'Lokacija nije pronađena' }

  // These two pages carry the local-search intent for the whole site ("robotika
  // za djecu split", "radionice za djecu šibenik"), so the title leads with the
  // query wording rather than with "Lokacije".
  const locative = city.label === 'Split' ? 'Splitu' : 'Šibeniku'
  const desc = `Radionice robotike i programiranja za djecu od 6 do 14 godina u ${locative}. LEGO Spike, male grupe. Kontakt, adrese i upis u programe Udruge Inovatic.`
  return {
    title: `Robotika za djecu ${city.label} – radionice i programiranje`,
    description: desc,
    openGraph: {
      ...OG_DEFAULTS,
      title: `Robotika za djecu ${city.label} – Udruga Inovatic`,
      description: desc,
      url: `https://udruga-inovatic.hr/lokacije/${city.slug}`,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `Inovatic ${city.label}` }],
    },
    alternates: { canonical: `https://udruga-inovatic.hr/lokacije/${city.slug}` },
  }
}

export default async function CityLocationPage({ params }: PageProps) {
  const { city: slug } = await params
  const city = getCity(slug)
  if (!city) notFound()

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden relative">
        <div aria-hidden="true" className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-cyan-300 blur-3xl opacity-40 pointer-events-none" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-12 w-56 h-56 rounded-full bg-yellow-200 blur-3xl opacity-40 pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <Link href="/lokacije" className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Sve lokacije
          </Link>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Inovatic {city.label}</h1>
          <p className="text-gray-600 text-lg leading-relaxed">{city.intro}</p>

          {/* City switcher */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/70 backdrop-blur p-1 shadow-sm">
            {CITIES.map((c) => (
              <Link
                key={c.slug}
                href={`/lokacije/${c.slug}`}
                aria-current={c.slug === city.slug ? 'page' : undefined}
                className={
                  c.slug === city.slug
                    ? 'px-4 py-1.5 text-sm font-semibold rounded-full bg-cyan-500 text-white shadow-sm'
                    : 'px-4 py-1.5 text-sm font-medium rounded-full text-gray-600 hover:text-cyan-600 hover:bg-gray-50'
                }
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Contact info */}
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Kontakt informacije</h2>
                <div className="space-y-4">
                  <a
                    href={`mailto:${city.upisi}`}
                    className="flex items-center gap-3 text-sm text-gray-600 hover:text-cyan-600 transition-colors group"
                  >
                    <div className="w-9 h-9 bg-cyan-50 border border-cyan-200 rounded-xl flex items-center justify-center group-hover:bg-cyan-100 transition-colors flex-shrink-0">
                      <Mail className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-medium">Email za prijave</div>
                      <div className="font-medium text-gray-800">{city.upisi}</div>
                    </div>
                  </a>
                  <a
                    href={`mailto:${SHARED_EMAILS.info}`}
                    className="flex items-center gap-3 text-sm text-gray-600 hover:text-emerald-600 transition-colors group"
                  >
                    <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors flex-shrink-0">
                      <Mail className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-medium">Opći upiti</div>
                      <div className="font-medium text-gray-800">{SHARED_EMAILS.info}</div>
                    </div>
                  </a>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Radno vrijeme</h3>
                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4 text-cyan-500" />
                    <span>Nastava: Ponedjeljak – Subota</span>
                  </div>
                  <p className="text-xs text-gray-400 ml-6">Termini se dogovaraju prema rasporedu grupa.</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Pratite nas</h3>
                <div className="flex gap-3">
                  <a
                    href="https://facebook.com/udrugainovatic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-cyan-600 transition-colors bg-white border border-gray-200 rounded-xl px-4 py-2"
                  >
                    <FacebookIcon className="w-4 h-4" /> Facebook
                  </a>
                  <a
                    href="https://instagram.com/udruga_inovatic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-cyan-600 transition-colors bg-white border border-gray-200 rounded-xl px-4 py-2"
                  >
                    <InstagramIcon className="w-4 h-4" /> Instagram
                  </a>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <Link
                  href="/upisi"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-sm"
                >
                  Pošalji upit za upis <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Venues */}
            <div className="lg:col-span-2 space-y-8">
              {city.venues.map((venue) => (
                <div key={venue.name} className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
                  {/* Photo */}
                  <div className="relative aspect-[16/9] bg-gray-100">
                    <Image
                      src={venue.image}
                      alt={venue.imageAlt}
                      fill
                      sizes="(max-width: 1024px) 100vw, 640px"
                      className="object-cover"
                    />
                    {venue.badge && (
                      <span className="absolute top-3 left-3 text-[11px] font-semibold text-cyan-800 bg-white/90 backdrop-blur border border-cyan-100 rounded-full px-2.5 py-1 shadow-sm">
                        {venue.badge}
                      </span>
                    )}
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Address */}
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-cyan-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">{venue.address}, {venue.postal}</div>
                        {venue.institution && (
                          <div className="text-xs text-cyan-600 font-medium mt-0.5">{venue.institution}</div>
                        )}
                      </div>
                      <a
                        href={venue.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${venue.mapQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs text-cyan-500 hover:underline font-medium whitespace-nowrap"
                      >
                        Otvori u kartama
                      </a>
                    </div>

                    <p className="text-sm text-gray-600 leading-relaxed">{venue.description}</p>

                    {/* Coordinator */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-900">{venue.coordinator.name}</span>
                        <span className="text-xs text-gray-400">· {venue.coordinator.role}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <a
                          href={`mailto:${venue.coordinator.email}`}
                          className="inline-flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-700 font-medium"
                        >
                          <Mail className="w-3.5 h-3.5" /> {venue.coordinator.email}
                        </a>
                        <a
                          href={`tel:${venue.coordinator.phone.replaceAll(/\s/g, '')}`}
                          className="inline-flex items-center gap-1.5 text-sm text-yellow-700 hover:text-yellow-800 font-medium"
                        >
                          <Phone className="w-3.5 h-3.5" /> {venue.coordinator.phone}
                        </a>
                      </div>
                      {venue.website && (
                        <a
                          href={venue.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-cyan-600 font-medium"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Više o lokaciji: {venue.institution ?? venue.name}
                        </a>
                      )}
                    </div>

                    {/* Map */}
                    <div className="h-56 rounded-xl overflow-hidden border border-gray-100">
                      <iframe
                        src={`https://maps.google.com/maps?q=${venue.mapQuery}&z=16&output=embed&iwloc=`}
                        className="w-full h-full border-0"
                        loading="lazy"
                        title={`Karta – ${venue.address}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
