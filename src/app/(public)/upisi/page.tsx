import type { Metadata } from 'next'
import { CheckCircle } from 'lucide-react'
import { InquiryForm } from '@/components/public/inquiry-form'

export const metadata: Metadata = {
  title: 'Upisi',
  description: 'Upiši dijete na tečaj LEGO robotike u Splitu. Ispuni upit i kontaktirat ćemo te s dostupnim terminima. Bez obveza.',
  openGraph: {
    title: 'Upiši dijete – LEGO Robotika | Inovatic Split',
    description: 'Ispuni kratki upit i kontaktirat ćemo te s dostupnim grupama i terminima. Bez obveza.',
    url: 'https://udruga-inovatic.hr/upisi',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – LEGO Robotika za djecu u Splitu' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/upisi' },
}

const perks = [
  'Bez obveza – samo šaljete upit',
  'Kontaktiramo vas u roku 48h',
  'Preporučujemo program prema dobi',
  'Objašnjavamo sve detalje',
]

const perkIconColors = [
  'text-cyan-500',
  'text-yellow-400',
  'text-emerald-400',
  'text-purple-400',
]

const stepStyles = [
  'bg-cyan-500 text-white',
  'bg-yellow-400 text-gray-900',
  'bg-emerald-400 text-gray-900',
  'bg-orange-400 text-gray-900',
]

export default function InquiryPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-12 px-4 overflow-hidden">
        {/* Blob decorations */}
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-cyan-400 rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-yellow-300 rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Upisi</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">Upiši dijete</h1>
          <p className="text-gray-600 text-lg max-w-xl mx-auto">
            Ispunite kratki obrazac ispod i naš tim će vas kontaktirati s dostupnim terminima i grupama.
          </p>
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="grid lg:grid-cols-5 gap-10">
            {/* Sidebar */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="font-bold text-gray-900 mb-4">Kako funkcionira?</h2>
                <div className="space-y-3">
                  {[
                    { n: '1', text: 'Ispunite upit s podacima o roditelju i djetetu.' },
                    { n: '2', text: 'Mi pregledamo upit i provjerimo slobodna mjesta.' },
                    { n: '3', text: 'Šaljemo vam email s dostupnim terminima.' },
                    { n: '4', text: 'Dogovorite termin i upišemo dijete.' },
                  ].map((item, i) => (
                    <div key={item.n} className="flex gap-3">
                      <div
                        className={`w-7 h-7 rounded-full ${stepStyles[i]} text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}
                      >
                        {item.n}
                      </div>
                      <p className="text-sm text-gray-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-yellow-50 rounded-2xl p-5 border border-yellow-100">
                <h3 className="font-bold text-gray-900 mb-3 text-sm">Prednosti</h3>
                <div className="space-y-2">
                  {perks.map((perk, i) => (
                    <div key={perk} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 flex-shrink-0 ${perkIconColors[i]}`} />
                      <span className="text-sm text-gray-600">{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-100 text-sm text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">Imate pitanja?</p>
                <a href="mailto:prijave@udruga-inovatic.hr" className="text-cyan-500 hover:underline block">
                  prijave@udruga-inovatic.hr
                </a>
                <a href="tel:+385993936993" className="text-cyan-500 hover:underline block">
                  +385 99 393 6993
                </a>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl border border-cyan-100 ring-1 ring-cyan-50 shadow-sm p-7">
                <InquiryForm />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
