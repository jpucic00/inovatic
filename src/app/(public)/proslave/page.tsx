import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Users, Clock, Star, Phone, Mail, Euro } from 'lucide-react'
import { PartyRobotSvg } from '@/components/shared/party-robot-svg'
import { GearDecor } from '@/components/shared/decorations'
import { HeroCarousel } from '@/components/shared/hero-carousel'

export const metadata: Metadata = {
  title: 'Proslave',
  description:
    'Organizirajte nezaboravnu proslavu rođendana uz LEGO robotiku! Djeca grade i programiraju robote uz LEGO WeDo 2.0, SPIKE i Mindstorms EV3. Velebitska 32, Split.',
  openGraph: {
    title: 'Proslave uz LEGO Robotiku | Inovatic Split',
    description: 'Nezaboravna proslava rođendana – djeca grade i programiraju LEGO robote. Do 8 sudionika, 120 min + pauza. 150 EUR.',
    url: 'https://udruga-inovatic.hr/proslave',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/proslave' },
}

const included = [
  { text: 'Gradnja i programiranje LEGO robota (WeDo 2.0 / SPIKE / Mindstorms EV3)', color: 'bg-cyan-50 border-cyan-200', icon: '🤖' },
  { text: 'Stručni voditelj radionice', color: 'bg-yellow-50 border-yellow-200', icon: '👩‍🏫' },
  { text: 'Svi potrebni materijali, tableti i laptopi', color: 'bg-emerald-50 border-emerald-200', icon: '🧰' },
  { text: 'Izrada pozivnice za proslavu rođendana', color: 'bg-purple-50 border-purple-200', icon: '🎨' },
  { text: 'Prilagođeno dobi djece (6–14 god.)', color: 'bg-orange-50 border-orange-200', icon: '🎯' },
  { text: 'Trajanje: 120 min + 30 min pauza', color: 'bg-pink-50 border-pink-200', icon: '⏱️' },
]

const notIncluded = [
  'Hrana i piće nisu uključeni',
  'Po dogovoru: korištenje dodatne učionice za serviranje hrane i pića te boravak odraslih',
]

const steps = [
  { step: '01', title: 'Kontaktirajte nas', description: 'Pošaljite email na info@udruga-inovatic.hr ili nazovite na 099 393 6993 s datumom, brojem i dobi djece.', color: 'bg-yellow-400' },
  { step: '02', title: 'Dogovorimo detalje', description: 'Dogovaramo termin i prilagođavamo radionicu uzrastu i iskustvu sudionika.', color: 'bg-cyan-400' },
  { step: '03', title: 'Proslavite uz robotiku!', description: 'Nije potrebno predznanje – iskusni robo trener vodi kroz početne izazove robotike.', color: 'bg-emerald-400' },
]

const details = [
  { icon: Euro, value: '150 EUR', label: 'Kotizacija', bg: 'bg-yellow-50', border: 'border-yellow-200', iconColor: 'text-yellow-600' },
  { icon: Users, value: 'do 8', label: 'Uzvanika (sa slavljenikom)', bg: 'bg-cyan-50', border: 'border-cyan-200', iconColor: 'text-cyan-600' },
  { icon: Clock, value: '120 + 30 min', label: 'Radionica + pauza', bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600' },
  { icon: Star, value: '6–14', label: 'Preporučena dob', bg: 'bg-purple-50', border: 'border-purple-200', iconColor: 'text-purple-600' },
]

export default function CelebrationsPage() {
  return (
    <>
      {/* Hero */}
      <HeroCarousel
        images={[
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656838/articles/covers/besplatne-proljetne-radionice-2023.jpg', alt: 'Djeca na robotičkoj proslavi' },
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656910/articles/covers/zimska-skola-2024.jpg', alt: 'Zimska škola robotike' },
          { src: 'https://res.cloudinary.com/dgc2tp4f8/image/upload/v1773656904/articles/covers/zavrsetak-cjelogodisnjih-radionica-2022-2023.jpg', alt: 'Završetak radionica' },
        ]}
        overlayClassName="from-black/60 via-black/40 to-black/20"
      >
        <div className="text-center lg:text-left max-w-2xl">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-yellow-400 mb-4">Proslave rođendana</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
            Robotika ={' '}
            <span className="text-cyan-400">nezaboravna zabava</span>
          </h1>
          <p className="text-white/85 text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
            Provedi svoj rođendan zajedno sa svojim prijateljima na kreativan i zabavan način!
            Djeca grade i programiraju LEGO robote uz iskusnog robo trenera.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <a
              href="mailto:info@udruga-inovatic.hr?subject=Proslava%20ro%C4%91endana"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
            >
              Zatraži ponudu <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="tel:+385993936993"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white/15 text-white font-semibold rounded-xl border-2 border-white/30 hover:bg-white/25 hover:border-white/50 transition-colors text-base backdrop-blur-sm"
            >
              <Phone className="w-4 h-4" /> Nazovite nas
            </a>
          </div>
        </div>
      </HeroCarousel>

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
              <div key={item.text} className={`flex items-center gap-3 p-4 rounded-xl border ${item.color}`}>
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                <span className="text-sm text-gray-700 font-medium">{item.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Napomena</p>
            <ul className="space-y-1">
              {notIncluded.map((item) => (
                <li key={item} className="text-sm text-gray-500 flex items-start gap-2">
                  <span className="text-gray-400 mt-0.5">*</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="container mx-auto max-w-4xl">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
            {details.map(({ icon: Icon, value, label, bg, border, iconColor }) => (
              <div key={label} className={`rounded-2xl p-6 border ${bg} ${border} text-center`}>
                <div className={`w-10 h-10 ${bg} rounded-xl border ${border} flex items-center justify-center mx-auto mb-4`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div className={`text-2xl font-extrabold ${iconColor} mb-1`}>{value}</div>
                <div className="text-sm text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 rounded-2xl p-8 text-white text-center relative overflow-hidden">
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
              <GearDecor size={100} className="text-white animate-spin-slow" />
            </div>
            <h3 className="text-xl font-extrabold mb-3 relative">Lokacija</h3>
            <p className="text-cyan-100 mb-4 relative">Rođendanske radionice se održavaju na adresi:</p>
            <div className="flex flex-wrap justify-center gap-4 text-sm relative">
              <span className="bg-white/20 px-4 py-2 rounded-full">Velebitska 32, Split (Plokite)</span>
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
              <div key={step.step} className="flex gap-5 p-5 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors">
                <div className={`w-12 h-12 ${step.color} rounded-xl flex items-center justify-center text-gray-900 font-extrabold text-base flex-shrink-0 shadow-sm`}>
                  {step.step}
                </div>
                <div className="pt-1">
                  <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 bg-yellow-50 border-t border-yellow-100 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
          <PartyRobotSvg className="w-48 translate-x-6 translate-y-6" />
        </div>
        <div className="container mx-auto max-w-xl text-center relative">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Zanima vas proslava?</h2>
          <p className="text-gray-500 mb-6">
            Pišite nam za slobodne termine i cijeniku. Odgovaramo brzo!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:info@udruga-inovatic.hr?subject=Proslava%20ro%C4%91endana"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-sm"
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
