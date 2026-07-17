import type { Metadata } from 'next'
import { ArrowUpRight, Trophy, Award, Calendar, MapPin, ScanBarcode, Landmark } from 'lucide-react'
import { GearDecor } from '@/components/shared/decorations'
import { CopyButton } from '@/components/shared/copy-button'
import { DonationGallery } from '@/components/donacije/donation-gallery'
import { DonationBarcode } from '@/components/donacije/donation-barcode'

export const metadata: Metadata = {
  title: 'Donacije',
  description:
    'Podržite naše timove na putu na europsko (Zagreb, listopad 2026.) i svjetsko (Portoriko, prosinac 2026.) natjecanje World Robot Olympiad. Donirajte skeniranjem barkoda ili uplatom na IBAN.',
  openGraph: {
    title: 'Donacije – Podržite naše timove na World Robot Olympiad',
    description:
      'Svaka donacija, bez obzira na iznos, pomaže našim mladim inovatorima da predstavljaju Hrvatsku na WRO europskom i svjetskom natjecanju.',
    url: 'https://udruga-inovatic.hr/donacije',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – Donacije za WRO natjecanja' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/donacije' },
}

const RECIPIENT = 'Udruga za robotiku "Inovatic"'
const IBAN = 'HR7223400091110811408'
const PAYMENT_DESCRIPTION = 'Za put na europsko i svjetsko natjecanje'

const competitions = [
  {
    stage: 'Europsko natjecanje',
    when: 'Listopad 2026.',
    where: 'Zagreb, Hrvatska',
    icon: Trophy,
    highlight: false,
  },
  {
    stage: 'Svjetsko natjecanje',
    when: 'Prosinac 2026.',
    where: 'Portoriko',
    icon: Award,
    highlight: true,
  },
]

const galleryImages = Array.from({ length: 21 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  return {
    src: `/images/donacije/gallery/${n}.webp`,
    alt: `WRO 2026 državno prvenstvo u Samoboru – fotografija ${i + 1}`,
  }
})

export default function DonacijePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4 overflow-hidden relative">
        <div aria-hidden="true" className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-cyan-300 blur-3xl opacity-40 pointer-events-none" />
        <div aria-hidden="true" className="absolute -bottom-12 -right-12 w-56 h-56 rounded-full bg-yellow-200 blur-3xl opacity-40 pointer-events-none" />
        <GearDecor size={48} className="absolute top-8 right-10 text-cyan-200 opacity-60 rotate-12" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Donacije</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            Podržite naše timove na <span className="text-cyan-500">World Robot Olympiad</span> europskom i svjetskom natjecanju!
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Put na natjecanja ovisi o financijskoj podršci svih vas koji vjerujete u mlade inovatore.
          </p>
          <a
            href="#doniraj"
            className="mt-8 inline-flex items-center gap-2 px-7 py-3.5 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-300 transition-colors shadow-sm"
          >
            Doniraj sada <ScanBarcode className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Appeal + competition info */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">O natjecanju</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-5">
              Naši mladi inovatori predstavljaju Hrvatsku
            </h2>
            <div className="space-y-4 text-gray-600 leading-relaxed text-left">
              <p>
                Ovim putem pozivamo sve ljubitelje robotike, tehnologije i rada naše udruge da podrže naše
                timove i pomognu im da dostojno predstavljaju Hrvatsku na europskoj i svjetskoj pozornici
                robotičkog natjecanja World Robot Olympiad (WRO). Europsko natjecanje održava se u listopadu
                2026. g. u Zagrebu, a svjetsko natjecanje održava se u prosincu 2026. u Portoriku. Više o
                natjecanju možete pogledati na službenim stranicama organizatora natjecanja:{' '}
                <a
                  href="https://wro-association.org/competition/2026-season/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-cyan-600 hover:text-cyan-700 inline-flex items-center gap-0.5"
                >
                  2026 Season – WRO Association
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
                {'.'}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {competitions.map((comp) => (
              <div
                key={comp.stage}
                className={`rounded-2xl p-6 border shadow-sm ${
                  comp.highlight ? 'bg-yellow-50 border-yellow-200' : 'bg-cyan-50 border-cyan-100'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                  comp.highlight ? 'bg-yellow-400' : 'bg-cyan-100'
                }`}>
                  <comp.icon className={`w-5 h-5 ${comp.highlight ? 'text-gray-900' : 'text-cyan-600'}`} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-3">{comp.stage}</h3>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    {comp.when}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    {comp.where}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to donate */}
      <section id="doniraj" className="py-16 px-4 bg-cyan-50/30 scroll-mt-20">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Kako donirati</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
              Donirajte skeniranjem koda ili uplatom na račun
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Svaka donacija, bez obzira na iznos, pomaže našim timovima da predstavljaju Hrvatsku u
              najboljem svjetlu.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center bg-white rounded-2xl p-6 md:p-8 border border-gray-100 shadow-sm">
            {/* Payment barcode */}
            <div className="flex flex-col items-center text-center">
              <DonationBarcode
                src="/images/donacije/barkod.jpeg"
                alt="2D barkod za uplatu donacije Udruzi Inovatic"
              />
              <p className="text-sm text-gray-500 mt-4 inline-flex items-center gap-1.5">
                <ScanBarcode className="w-4 h-4 text-cyan-500" />
                Skenirajte barkod u mobilnoj bankovnoj aplikaciji
              </p>
            </div>

            {/* Bank details */}
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 bg-cyan-50 px-3 py-1.5 rounded-lg mb-5">
                <Landmark className="w-4 h-4" />
                Uplata na račun
              </div>
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Primatelj</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{RECIPIENT}</span>
                    <CopyButton value={RECIPIENT} label="primatelja" />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">IBAN</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-gray-900 tracking-wide">{IBAN}</span>
                    <CopyButton value={IBAN} label="IBAN" />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Opis plaćanja</dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-gray-900">{PAYMENT_DESCRIPTION}</span>
                    <CopyButton value={PAYMENT_DESCRIPTION} label="opis plaćanja" />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Galerija</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              WRO 2026 – državno prvenstvo u Samoboru
            </h2>
          </div>
          <DonationGallery images={galleryImages} />
        </div>
      </section>
    </>
  )
}
