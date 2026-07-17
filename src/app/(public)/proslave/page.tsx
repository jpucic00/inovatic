import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Users, Clock, Star, Phone, Euro, Check, MapPin } from 'lucide-react'
import { PartyRobotSvg } from '@/components/shared/party-robot-svg'
import { GearDecor, ConfettiDecor } from '@/components/shared/decorations'
import { HeroCarousel } from '@/components/shared/hero-carousel'
import { PartyInquiryForm } from '@/components/public/party-inquiry-form'
import { SmoothScrollLink } from '@/components/shared/smooth-scroll-link'

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
  'Gradnja i programiranje LEGO robota (WeDo 2.0 / SPIKE / Mindstorms EV3)',
  'Stručni voditelj radionice',
  'Svi potrebni materijali, tableti i laptopi',
  'Izrada pozivnice za proslavu rođendana',
  'Prilagođeno dobi djece (6–14 god.)',
  'Trajanje: 120 min + 30 min pauza',
]

const notIncluded = [
  'Hrana i piće nisu uključeni',
  'Po dogovoru: korištenje dodatne učionice za serviranje hrane i pića te boravak odraslih',
]

const quickInfo = [
  { icon: Euro, iconColor: 'text-yellow-600', value: '150 EUR', label: 'Kotizacija' },
  { icon: Users, iconColor: 'text-cyan-600', value: 'Do 8 uzvanika', label: 'sa slavljenikom' },
  { icon: Clock, iconColor: 'text-emerald-600', value: '120 + 30 min', label: 'Radionica + pauza' },
  { icon: Star, iconColor: 'text-purple-600', value: '6–14 godina', label: 'Preporučena dob' },
]

const steps = [
  { number: '1', title: 'Kontaktirajte nas', description: 'Pošaljite email na info@udruga-inovatic.hr ili nazovite na 099 393 6993 s datumom, brojem i dobi djece.' },
  { number: '2', title: 'Dogovorimo detalje', description: 'Dogovaramo termin i prilagođavamo radionicu uzrastu i iskustvu sudionika.' },
  { number: '3', title: 'Proslavite uz robotiku!', description: 'Nije potrebno predznanje – iskusni robo trener vodi kroz početne izazove robotike.' },
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
        minHeightClassName="min-h-[34rem] lg:min-h-[43rem]"
      >
        <ConfettiDecor className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative z-10 text-center lg:text-left max-w-2xl">
          <span className="inline-flex items-center gap-2 px-4 py-2 mb-5 bg-white/15 border border-white/30 rounded-full text-white text-[13px] font-semibold backdrop-blur-sm">
            <Star className="w-[15px] h-[15px] fill-yellow-400 text-yellow-400" strokeWidth={1} />
            Proslave rođendana uz robotiku
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-[1.12]">
            Najbolji rođendan?<br />
            Onaj s <span className="text-cyan-400">robotima.</span>
          </h1>
          <p className="text-white/85 text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
            Provedi svoj rođendan zajedno sa svojim prijateljima na kreativan i zabavan način!
            Djeca grade i programiraju LEGO robote uz iskusnog robo trenera.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center lg:justify-start">
            <SmoothScrollLink
              targetId="upit"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
            >
              Zatraži ponudu <ArrowRight className="w-4 h-4" />
            </SmoothScrollLink>
            <a
              href="tel:+385993936993"
              className="inline-flex items-center gap-2 text-white font-semibold text-base underline underline-offset-4 decoration-white/40 hover:decoration-white transition-colors"
            >
              <Phone className="w-4 h-4" /> 099 393 6993
            </a>
          </div>
        </div>
      </HeroCarousel>

      {/* What's included + quick info */}
      <section className="py-16 sm:py-20 px-4 bg-white">
        <div className="container mx-auto max-w-5xl grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-14 items-start">
          {/* Checklist */}
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Sadržaj radionice</span>
            <h2 className="text-[32px] font-extrabold text-gray-900 mb-2">Što je uključeno</h2>
            <p className="text-gray-500 mb-7">Sve je pripremljeno – vi samo dovedete veselje!</p>
            <div className="flex flex-col gap-3.5">
              {included.map((item) => (
                <div key={item} className="flex items-center gap-3.5">
                  <span className="w-[34px] h-[34px] rounded-full bg-cyan-50 border-2 border-cyan-200 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 stroke-[3] text-cyan-600" />
                  </span>
                  <span className="text-[15px] text-gray-700 font-medium">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
              {notIncluded.map((item) => (
                <span key={item} className="block text-[13px] text-gray-500 [&+&]:mt-1">* {item}</span>
              ))}
            </div>
          </div>

          {/* Quick-info card */}
          <div className="bg-cyan-50 border-2 border-cyan-200 rounded-[20px] p-7">
            <div className="flex flex-col gap-[18px]">
              {quickInfo.map(({ icon: Icon, iconColor, value, label }) => (
                <div key={label} className="flex items-center gap-3.5">
                  <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-[19px] h-[19px] ${iconColor}`} strokeWidth={2} />
                  </span>
                  <div>
                    <div className="text-[19px] font-extrabold text-gray-900 leading-tight">{value}</div>
                    <div className="text-[13px] text-gray-500">{label}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3.5 border-t-2 border-dashed border-cyan-200 pt-4">
                <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-[19px] h-[19px] text-cyan-600" strokeWidth={2} />
                </span>
                <div>
                  <div className="text-[15px] font-bold text-gray-900 leading-tight">Velebitska 32, Split</div>
                  <div className="text-[13px] text-gray-500">Lokacija radionice</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How to reserve — cyan band */}
      <section className="py-16 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 relative overflow-hidden">
        <GearDecor size={160} className="absolute right-8 -top-6 text-white opacity-10 animate-spin-slow" />
        <GearDecor size={90} className="absolute left-6 -bottom-4 text-white opacity-10" />
        <div className="container mx-auto max-w-4xl relative">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-100 mb-3">Proces</span>
            <h2 className="text-2xl sm:text-[32px] font-extrabold text-white">Kako rezervirati</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {steps.map((step) => (
              <div key={step.number} className="bg-white/[0.12] border border-white/25 rounded-[18px] p-6 backdrop-blur-sm">
                <div className="w-11 h-11 bg-yellow-400 rounded-full flex items-center justify-center text-gray-900 font-extrabold text-base mb-4">
                  {step.number}
                </div>
                <h3 className="text-[17px] font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-cyan-100 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sign-up form */}
      <section id="upit" className="scroll-mt-20 py-14 px-4 bg-yellow-50 border-t border-yellow-100 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
          <PartyRobotSvg className="w-48 translate-x-6 translate-y-6" />
        </div>
        <div className="container mx-auto max-w-xl relative">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Zanima vas proslava?</h2>
            <p className="text-gray-500">
              Ostavite upit sa željenim terminom, a mi ćemo vam se u najkraćem roku javiti kako bismo dogovorili sve detalje.
            </p>
          </div>
          <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.06)] p-6 sm:p-8">
            <PartyInquiryForm />
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Radije biste nazvali?{' '}
            <a href="tel:+385993936993" className="text-cyan-600 font-medium hover:underline">
              099 393 6993
            </a>{' '}
            ·{' '}
            <Link href="/lokacije" className="text-cyan-600 font-medium hover:underline">
              Lokacije i kontakt
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}
