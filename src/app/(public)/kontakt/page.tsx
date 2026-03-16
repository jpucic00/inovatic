import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, Phone, MapPin, Clock, ArrowRight, Facebook, Instagram } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Kontakt',
  description: 'Kontaktirajte Udrugu Inovatic u Splitu. Dvije lokacije: Velebitska 32 i Ruđera Boškovića 33. Tel: +385 99 393 6993.',
  openGraph: {
    title: 'Kontakt – Udruga Inovatic Split',
    description: 'Dvije lokacije u Splitu: Velebitska 32 i Ruđera Boškovića 33. Tel: +385 99 393 6993.',
    url: 'https://udruga-inovatic.hr/kontakt',
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/kontakt' },
}

const locations = [
  {
    name: 'Lokacija 1 – Velebitska',
    address: 'Velebitska 32',
    city: '21000 Split',
    mapQuery: 'Velebitska+32,+Split,+Croatia',
  },
  {
    name: 'Lokacija 2 – Ruđera Boškovića',
    address: 'Ruđera Boškovića 33',
    city: '21000 Split',
    mapQuery: 'Ru%C4%91era+Bo%C5%A1kovi%C4%87a+33,+Split,+Croatia',
  },
]

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden relative">
        <div aria-hidden="true" className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-cyan-300 blur-3xl opacity-40 pointer-events-none" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-12 w-56 h-56 rounded-full bg-yellow-200 blur-3xl opacity-40 pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Kontakt</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Pronađite nas</h1>
          <p className="text-gray-600 text-lg">
            Imaju li pitanja ili ste zainteresirani za upis? Slobodno nas kontaktirajte putem emaila, telefona ili
            posjetite jednu od naših lokacija u Splitu.
          </p>
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
                    href="tel:+385993936993"
                    className="flex items-center gap-3 text-sm text-gray-600 hover:text-yellow-600 transition-colors group"
                  >
                    <div className="w-9 h-9 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-center group-hover:bg-yellow-100 transition-colors flex-shrink-0">
                      <Phone className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-medium">Telefon</div>
                      <div className="font-medium text-gray-800">+385 99 393 6993</div>
                    </div>
                  </a>
                  <a
                    href="mailto:prijave@udruga-inovatic.hr"
                    className="flex items-center gap-3 text-sm text-gray-600 hover:text-cyan-600 transition-colors group"
                  >
                    <div className="w-9 h-9 bg-cyan-50 border border-cyan-200 rounded-xl flex items-center justify-center group-hover:bg-cyan-100 transition-colors flex-shrink-0">
                      <Mail className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-medium">Email za prijave</div>
                      <div className="font-medium text-gray-800">prijave@udruga-inovatic.hr</div>
                    </div>
                  </a>
                  <a
                    href="mailto:info@udruga-inovatic.hr"
                    className="flex items-center gap-3 text-sm text-gray-600 hover:text-emerald-600 transition-colors group"
                  >
                    <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors flex-shrink-0">
                      <Mail className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 font-medium">Opći upiti</div>
                      <div className="font-medium text-gray-800">info@udruga-inovatic.hr</div>
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
                    <Facebook className="w-4 h-4" /> Facebook
                  </a>
                  <a
                    href="https://instagram.com/udruga_inovatic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-cyan-600 transition-colors bg-white border border-gray-200 rounded-xl px-4 py-2"
                  >
                    <Instagram className="w-4 h-4" /> Instagram
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

            {/* Maps */}
            <div className="lg:col-span-2 space-y-6">
              {locations.map((loc) => (
                <div key={loc.name} className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  <div className="p-4 bg-white border-b border-gray-50 flex items-center gap-3">
                    <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-cyan-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{loc.name}</div>
                      <div className="text-xs text-gray-500">{loc.address}, {loc.city}</div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${loc.mapQuery}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs text-cyan-500 hover:underline font-medium"
                    >
                      Otvori u kartama
                    </a>
                  </div>
                  <div className="h-64 bg-gray-100">
                    <iframe
                      src={`https://maps.google.com/maps?q=${loc.mapQuery}&output=embed&iwloc=`}
                      className="w-full h-full border-0"
                      loading="lazy"
                      title={`Karta – ${loc.address}`}
                    />
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
