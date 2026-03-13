import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Users, Clock, Star, CheckCircle, Phone, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Proslave',
  description:
    'Organizirajte nezaboravnu proslavu rođendana uz LEGO robotiku! Djeca grade i programiraju robote. Dvije lokacije u Splitu.',
}

const included = [
  'Gradnja i programiranje LEGO robota',
  'Stručni voditelj radionice',
  'Svi potrebni materijali i oprema',
  'Certifikat za svakog sudionika',
  'Prilagođeno dobi djece (6–14 god.)',
  'Trajanje: 90–120 minuta',
]

const steps = [
  { step: '01', title: 'Kontaktirajte nas', description: 'Pošaljite email ili nazovite i recite nam datum, broj djece i dob.' },
  { step: '02', title: 'Dogovorimo detalje', description: 'Odaberemo lokaciju, termin i prilagodimo radionicu dobi sudionika.' },
  { step: '03', title: 'Proslavite uz robotiku!', description: 'Mi se brinemo za sve – vi i djeca samo uživate u izgradnji robota.' },
]

export default function CelebrationsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-yellow-50 via-white to-cyan-50 py-20 px-4 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-100 rounded-full opacity-40 blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-yellow-600 mb-3">Proslave rođendana</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            Robotika = <span className="text-cyan-500">nezaboravna zabava</span>
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed mb-8">
            Dajte djetetu proslavu kakvu neće zaboraviti! Djeca grade i programiraju LEGO robote,
            surađuju u timovima i odlaze kući s ponosom – i certifikatom.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:info@udruga-inovatic.hr?subject=Proslava%20ro%C4%91endana"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
            >
              Zatraži ponudu <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="tel:+385993936993"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-gray-700 font-semibold rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
            >
              <Phone className="w-4 h-4" /> Nazovite nas
            </a>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Sadržaj radionice</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">Što je uključeno</h2>
            <p className="text-gray-500">Sve je pripremljeno – vi samo dovedete veselje!</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {included.map((item) => (
              <div key={item} className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
                <CheckCircle className="w-5 h-5 text-cyan-500 flex-shrink-0" />
                <span className="text-sm text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="text-2xl font-extrabold text-gray-900 mb-1">5–15</div>
              <div className="text-sm text-gray-500">Broj sudionika</div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="text-2xl font-extrabold text-gray-900 mb-1">90–120 min</div>
              <div className="text-sm text-gray-500">Trajanje radionice</div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center">
              <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Star className="w-5 h-5 text-cyan-600" />
              </div>
              <div className="text-2xl font-extrabold text-gray-900 mb-1">6–14</div>
              <div className="text-sm text-gray-500">Preporučena dob</div>
            </div>
          </div>

          <div className="bg-cyan-500 rounded-2xl p-8 text-white text-center">
            <h3 className="text-xl font-extrabold mb-3">Dostupne lokacije</h3>
            <p className="text-cyan-100 mb-4">Radionice se mogu održati u jednoj od naših dviju učionica u Splitu:</p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <span className="bg-white/20 px-4 py-2 rounded-full">Velebitska 32, Split</span>
              <span className="bg-white/20 px-4 py-2 rounded-full">Ruđera Boškovića 33, Split</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Proces</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Kako rezervirati</h2>
          </div>
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.step} className="flex gap-5 p-5 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center text-gray-900 font-extrabold text-sm flex-shrink-0">
                  {step.step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="container mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Zanima vas proslava?</h2>
          <p className="text-gray-500 mb-6">
            Pišite nam za slobodne termine i cijeniku. Odgovaramo brzo!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:info@udruga-inovatic.hr?subject=Proslava%20ro%C4%91endana"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors"
            >
              <Mail className="w-4 h-4" /> Pišite nam email
            </a>
            <Link
              href="/kontakt"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Kontakt informacije <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
