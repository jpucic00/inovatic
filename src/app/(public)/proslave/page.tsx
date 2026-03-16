import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Users, Clock, Star, CheckCircle, Phone, Mail } from 'lucide-react'
import { PartyRobotSvg } from '@/components/shared/party-robot-svg'

export const metadata: Metadata = {
  title: 'Proslave',
  description:
    'Organizirajte nezaboravnu proslavu rođendana uz LEGO robotiku! Djeca grade i programiraju robote. Dvije lokacije u Splitu.',
  openGraph: {
    title: 'Proslave uz LEGO Robotiku | Inovatic Split',
    description: 'Nezaboravna proslava rođendana – djeca grade i programiraju LEGO robote. 5–15 sudionika, 90–120 min.',
    url: 'https://udruga-inovatic.hr/proslave',
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/proslave' },
}

const included = [
  { text: 'Gradnja i programiranje LEGO robota', color: 'bg-cyan-50 border-cyan-200', icon: '🤖' },
  { text: 'Stručni voditelj radionice', color: 'bg-yellow-50 border-yellow-200', icon: '👩‍🏫' },
  { text: 'Svi potrebni materijali i oprema', color: 'bg-emerald-50 border-emerald-200', icon: '🧰' },
  { text: 'Certifikat za svakog sudionika', color: 'bg-purple-50 border-purple-200', icon: '🏅' },
  { text: 'Prilagođeno dobi djece (6–14 god.)', color: 'bg-orange-50 border-orange-200', icon: '🎯' },
  { text: 'Trajanje: 90–120 minuta', color: 'bg-pink-50 border-pink-200', icon: '⏱️' },
]

const steps = [
  { step: '01', title: 'Kontaktirajte nas', description: 'Pošaljite email ili nazovite i recite nam datum, broj djece i dob.', color: 'bg-yellow-400' },
  { step: '02', title: 'Dogovorimo detalje', description: 'Odaberemo lokaciju, termin i prilagodimo radionicu dobi sudionika.', color: 'bg-cyan-400' },
  { step: '03', title: 'Proslavite uz robotiku!', description: 'Mi se brinemo za sve – vi i djeca samo uživate u izgradnji robota.', color: 'bg-emerald-400' },
]

const details = [
  { icon: Users, value: '5–15', label: 'Broj sudionika', bg: 'bg-cyan-50', border: 'border-cyan-200', iconColor: 'text-cyan-600' },
  { icon: Clock, value: '90–120 min', label: 'Trajanje radionice', bg: 'bg-yellow-50', border: 'border-yellow-200', iconColor: 'text-yellow-600' },
  { icon: Star, value: '6–14', label: 'Preporučena dob', bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600' },
]

function StarDecor({ size, className }: { size: number; className?: string }) {
  const c = size / 2
  const r1 = size / 2
  const r2 = size * 0.38
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    const r = i % 2 === 0 ? r1 : r2
    return `${c + r * Math.cos(angle)},${c + r * Math.sin(angle)}`
  }).join(' ')
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="currentColor" className={className} aria-hidden="true">
      <polygon points={points} />
    </svg>
  )
}

function GearDecor({ size, className }: { size: number; className?: string }) {
  const r = size / 2
  const innerR = r * 0.55
  const toothW = size * 0.18
  const toothH = size * 0.14
  const cx = r
  const cy = r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className} aria-hidden="true">
      <circle cx={cx} cy={cy} r={innerR} fill="currentColor" />
      <rect x={cx - toothW / 2} y={0} width={toothW} height={toothH} rx={toothW * 0.3} fill="currentColor" />
      <rect x={cx - toothW / 2} y={size - toothH} width={toothW} height={toothH} rx={toothW * 0.3} fill="currentColor" />
      <rect x={0} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * 0.3} fill="currentColor" />
      <rect x={size - toothH} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * 0.3} fill="currentColor" />
    </svg>
  )
}

export default function CelebrationsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-yellow-50 via-white to-cyan-50 py-20 px-4 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-100 rounded-full opacity-40 blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-100 rounded-full opacity-40 blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="container mx-auto max-w-6xl relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* Left: text */}
            <div className="text-center lg:text-left">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-yellow-600 mb-4">Proslave rođendana</span>
              <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
                Robotika ={' '}
                <span className="text-cyan-500">nezaboravna zabava</span>
              </h1>
              <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
                Dajte djetetu proslavu kakvu neće zaboraviti! Djeca grade i programiraju LEGO robote,
                surađuju u timovima i odlaze kući s ponosom – i certifikatom.
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
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-gray-700 font-semibold rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base"
                >
                  <Phone className="w-4 h-4" /> Nazovite nas
                </a>
              </div>
            </div>

            {/* Right: party robot */}
            <div className="flex items-center justify-center relative py-4 lg:py-8">
              {/* Decorative gears */}
              <div className="absolute top-6 left-6 text-yellow-400 animate-spin-slow opacity-70">
                <GearDecor size={48} />
              </div>
              <div className="absolute bottom-10 right-4 text-cyan-300 animate-spin-slow-reverse opacity-60">
                <GearDecor size={30} />
              </div>
              {/* Stars */}
              <div className="absolute top-10 right-16 text-yellow-400 animate-twinkle">
                <StarDecor size={20} />
              </div>
              <div className="absolute bottom-16 left-10 text-pink-400 animate-twinkle" style={{ animationDelay: '0.7s' }}>
                <StarDecor size={14} />
              </div>
              <div className="absolute top-28 left-2 text-cyan-300 animate-twinkle" style={{ animationDelay: '1.4s' }}>
                <StarDecor size={10} />
              </div>
              {/* Confetti dots */}
              <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-pink-400 opacity-60 animate-twinkle" style={{ animationDelay: '0.3s' }} />
              <div className="absolute bottom-8 left-20 w-2 h-2 rounded-full bg-emerald-400 opacity-60 animate-twinkle" style={{ animationDelay: '1.1s' }} />
              <PartyRobotSvg className="w-44 sm:w-56 lg:w-64 xl:w-72 animate-float drop-shadow-xl" />
            </div>
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
              <div key={item.text} className={`flex items-center gap-3 p-4 rounded-xl border ${item.color}`}>
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                <span className="text-sm text-gray-700 font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-3 gap-6 mb-10">
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
            <h3 className="text-xl font-extrabold mb-3 relative">Dostupne lokacije</h3>
            <p className="text-cyan-100 mb-4 relative">Radionice se mogu održati u jednoj od naših dviju učionica u Splitu:</p>
            <div className="flex flex-wrap justify-center gap-4 text-sm relative">
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
