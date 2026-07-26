import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  ClipboardList,
  Compass,
  GraduationCap,
  LifeBuoy,
  Mail,
  Phone,
  Rocket,
} from 'lucide-react'
import { GearDecor } from '@/components/shared/decorations'
import { SmoothScrollLink } from '@/components/shared/smooth-scroll-link'
import { StemEducationForm } from '@/components/public/stem-education-form'

export const metadata: Metadata = {
  title: 'STEM edukacija za učitelje, nastavnike i mentore',
  description:
    'Osnovne i napredne edukacije za mentore, savjetovanje pri odabiru STEM opreme te izrada radionica i kurikuluma za škole, udruge i ustanove. Edukacija kod vas ili u našim prostorima.',
  openGraph: {
    title: 'STEM edukacija za učitelje, nastavnike i mentore | Inovatic',
    description:
      'Od odabira opreme do samostalne provedbe kvalitetnih STEM radionica – edukacija mentora, savjetovanje i izrada kurikuluma.',
    url: 'https://udruga-inovatic.hr/stem-edukacija',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Inovatic – STEM edukacija za mentore' }],
  },
  alternates: { canonical: 'https://udruga-inovatic.hr/stem-edukacija' },
}

const services = [
  {
    icon: GraduationCap,
    title: 'Osnovna edukacija mentora',
    description:
      'Za učitelje i voditelje bez prethodnog iskustva – osnove rada s opremom, priprema prve radionice i vođenje učenika kroz praktičan zadatak.',
  },
  {
    icon: Rocket,
    title: 'Napredna edukacija',
    description:
      'Za mentore s iskustvom – projektno učenje, višesatne radionice, praćenje napretka i priprema učenika za smotre i natjecanja.',
  },
  {
    icon: Compass,
    title: 'Savjetovanje pri odabiru opreme',
    description:
      'Procjena koja je oprema primjerena dobi učenika, broju korisnika, iskustvu mentora, prostoru i proračunu – prije nego što je nabavite.',
  },
  {
    icon: ClipboardList,
    title: 'Izrada radionica i kurikuluma',
    description:
      'Ishodi učenja, scenariji za mentore, godišnji program i prijedlozi vrednovanja – za redovnu nastavu, STEM klubove ili kampove.',
  },
  {
    icon: LifeBuoy,
    title: 'Podrška pri pokretanju programa',
    description:
      'Analiza potreba, preporuka opreme, edukacija mentora i podrška tijekom prvih samostalnih radionica – do održive provedbe.',
  },
]

const audience = [
  'Osnovne i srednje škole',
  'Učitelji, nastavnici i stručni suradnici',
  'Voditelji školskih STEM klubova',
  'Udruge koje rade s djecom i mladima',
  'Centri tehničke kulture',
  'Knjižnice i obrazovni centri',
]

const steps = [
  {
    number: '1',
    title: 'Pošaljete upit',
    description: 'Opišete ustanovu, broj sudionika, postojeću opremu i podršku koja vam je potrebna.',
  },
  {
    number: '2',
    title: 'Analiziramo potrebe',
    description: 'Zajedno definiramo ciljeve edukacije, razinu znanja sudionika, lokaciju i STEM teme.',
  },
  {
    number: '3',
    title: 'Pripremamo prijedlog',
    description: 'Dobivate prijedlog sadržaja, trajanja i načina provedbe te ponudu za vašu ustanovu.',
  },
  {
    number: '4',
    title: 'Provodimo edukaciju',
    description: 'Kod vas ili u našim prostorima, uz naglasak na praktičnom radu i primjenjivim primjerima.',
  },
]

export default function StemEducationPage() {
  return (
    <>
      {/* Hero — the original WP jumbotron photo (mentor training, 2016) behind a
          dark overlay; the source is only 1024px wide, so it stays a background
          layer rather than a foreground image. */}
      <section className="relative overflow-hidden bg-slate-900 px-4 pt-28 pb-16 sm:pt-32 sm:pb-20">
        <Image
          src="/images/hero/stem-edukacija/1.jpeg"
          alt="Edukacija učitelja i mentora u računalnoj učionici"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_42%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,35,42,0.86)_0%,rgba(8,35,42,0.82)_45%,rgba(8,35,42,0.94)_100%)]" />
        <div className="container mx-auto max-w-4xl relative text-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 mb-5 bg-white/10 border border-white/25 rounded-full text-white text-[13px] font-semibold backdrop-blur-sm">
            <GraduationCap className="w-[15px] h-[15px] text-yellow-400" />
            Za škole, udruge i ustanove
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold text-white leading-[1.15] mb-5">
            STEM edukacija za učitelje,<br className="hidden sm:block" /> nastavnike i mentore
          </h1>
          <p className="text-white/80 text-lg leading-relaxed max-w-2xl mx-auto mb-8">
            Od odabira opreme do samostalne provedbe kvalitetnih STEM radionica. Educiramo mentore,
            savjetujemo pri nabavi opreme i izrađujemo programe prilagođene vašoj ustanovi.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <SmoothScrollLink
              targetId="upit"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
            >
              Zatražite ponudu <ArrowRight className="w-4 h-4" />
            </SmoothScrollLink>
            <a
              href="tel:+385993936993"
              className="inline-flex items-center gap-2 text-white font-semibold text-base underline underline-offset-4 decoration-white/40 hover:decoration-white transition-colors"
            >
              <Phone className="w-4 h-4" /> 099 393 6993
            </a>
          </div>
        </div>
      </section>

      {/* Why — equipment alone is not enough */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-3xl text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
            Zašto edukacija
          </span>
          <h2 className="text-2xl sm:text-[32px] font-extrabold text-gray-900 mb-4">
            Oprema je tek početak
          </h2>
          <p className="text-gray-500 text-lg leading-relaxed">
            Škole i ustanove sve češće nabavljaju opremu za robotiku, programiranje, elektroniku i 3D
            modeliranje, ali sama nabava ne jamči da će se ona kvalitetno i redovito koristiti. Za to
            su potrebni sigurni mentori koji znaju pripremiti radionicu primjerenu dobi učenika,
            samostalno ih voditi kroz projekte i povezati opremu s nastavnim ciljevima.
          </p>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 px-4 bg-gradient-to-br from-cyan-50 via-white to-yellow-50">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
              Usluge
            </span>
            <h2 className="text-2xl sm:text-[32px] font-extrabold text-gray-900 mb-3">Što nudimo</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Sadržaj i tempo prilagođavamo iskustvu sudionika, opremi kojom ustanova raspolaže i
              ciljevima koje želi ostvariti.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-cyan-100 transition-all"
              >
                <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-cyan-500" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience + venue */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-5xl grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
              Kome je namijenjeno
            </span>
            <h2 className="text-2xl sm:text-[32px] font-extrabold text-gray-900 mb-4">
              Za ustanove svih razina
            </h2>
            <ul className="flex flex-col gap-2.5">
              {audience.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-gray-700">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-gray-500">
              Za osnovnu edukaciju nije potrebno prethodno iskustvo – program i tempo prilagođavamo
              početnoj razini sudionika.
            </p>
          </div>
          <div className="bg-cyan-50 border-2 border-cyan-200 rounded-[20px] p-7">
            <h3 className="text-lg font-extrabold text-gray-900 mb-4">Gdje se održava edukacija?</h3>
            <div className="mb-5">
              <p className="font-bold text-gray-900 text-[15px] mb-1">U vašoj školi ili ustanovi</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Radimo s većim brojem djelatnika, na opremi koju će mentori svakodnevno koristiti i u
                stvarnim prostornim uvjetima.
              </p>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-[15px] mb-1">U našim prostorima</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Pripremljeno radno okruženje i oprema – prikladno za pojedince i manje skupine
                mentora.
              </p>
            </div>
            <p className="mt-5 pt-4 border-t-2 border-dashed border-cyan-200 text-[13px] text-gray-500">
              Trajanje, broj sudionika i sadržaj dogovaraju se prema potrebama naručitelja. Edukaciju
              možemo prilagoditi i zahtjevima projekta ili natječaja.
            </p>
          </div>
        </div>
      </section>

      {/* Process — cyan band */}
      <section className="py-16 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 relative overflow-hidden">
        <GearDecor size={160} className="absolute right-8 -top-6 text-white opacity-10 animate-spin-slow" />
        <GearDecor size={90} className="absolute left-6 -bottom-4 text-white opacity-10" />
        <div className="container mx-auto max-w-5xl relative">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-100 mb-3">
              Proces
            </span>
            <h2 className="text-2xl sm:text-[32px] font-extrabold text-white">Kako izgleda suradnja</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
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

      {/* Inquiry form */}
      <section id="upit" className="scroll-mt-20 py-14 px-4 bg-yellow-50 border-t border-yellow-100">
        <div className="container mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Zatražite prijedlog programa</h2>
            <p className="text-gray-500">
              Ukratko nam opišite kakva vam je STEM edukacija potrebna. Na temelju upita pripremit
              ćemo prijedlog sljedećih koraka i ponudu.
            </p>
          </div>
          <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.06)] p-6 sm:p-8">
            <StemEducationForm />
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            Radije biste pisali ili nazvali?{' '}
            <a href="mailto:prijave@udruga-inovatic.hr" className="text-cyan-600 font-medium hover:underline">
              <Mail className="inline w-3.5 h-3.5 -mt-0.5" /> prijave@udruga-inovatic.hr
            </a>{' '}
            ·{' '}
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
