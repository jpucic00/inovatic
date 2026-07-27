import type { Metadata } from 'next'
import Image from 'next/image'
import {
  ArrowUpRight,
  Trophy,
  Award,
  Calendar,
  MapPin,
  ScanBarcode,
  Landmark,
  FileText,
  Download,
  Sparkles,
  Paintbrush,
  Gauge,
  Cpu,
  Blocks,
  CheckCircle2,
  Quote,
} from 'lucide-react'
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
const DONATION_CONTRACT_HREF = '/documents/ugovor-o-donaciji-wro-2026.docx'

const teamMembers = [
  {
    name: 'Vito Tonšić',
    photo: '/images/donacije/pametni-kist/vito.webp',
    role: 'Elektronika i programiranje',
    bio: 'Mladi inovator zadužen za „srce i mozak” projekta – dizajniranje elektroničkih shema i programiranje. Iza sebe ima godine rada u udruzi Inovatic i sudjelovanja na natjecanjima poput FLL-a, WRO-a, Robokupa i Robosima.',
    quote: 'Ako imate ideju koja zvuči ludo, pokušajte je ostvariti. Kroz pokušaje i pogreške uči se najviše!',
  },
  {
    name: 'Jure Vukušić',
    photo: '/images/donacije/pametni-kist/jure.webp',
    role: 'Konstrukcija i ergonomija',
    bio: 'Kreativna snaga tima zadužena za konstrukciju, ergonomiju i mehaniku kista. Koristeći CAD softvere i 3D print, pretvorio je ideju u funkcionalan, lagan i ergonomski ručni alat. Sudionik je brojnih robotičkih natjecanja i zaljubljenik u tehničko rješavanje problema.',
    quote: 'Upornost i detaljna priprema ključ su svakog uspjeha. Robotika nam daje moć da stvaramo opipljive promjene u svijetu.',
  },
  {
    name: 'Bruno Bešlić',
    photo: '/images/donacije/pametni-kist/bruno.webp',
    role: 'Mentor · mag. edu. inf. et techn.',
    bio: 'Istaknuti učitelj informatike i tehničke kulture (OŠ Vjekoslava Paraća, Solin) te vanjski suradnik na splitskom Prirodoslovno-matematičkom fakultetu. S više od deset godina mentorskog staža, od čega osam u Inovaticu, Bruno uspješno usmjerava mlade talente prema vrhunskim rezultatima.',
    quote: null,
  },
] as const

const techFeatures = [
  {
    icon: Gauge,
    title: 'Senzor sile (FSR)',
    text: 'Ugrađeni mikrosenzor sile u stvarnom vremenu mjeri pritisak. Pritisne li korisnik previše jako, kist odmah reagira i upozorava svjetlom, zvukom i vibracijom.',
  },
  {
    icon: Cpu,
    title: 'Napredna tehnologija',
    text: 'Razvijena su tri modela. Najnapredniji pokreće Arduino NANO ESP32, ima OLED zaslon, punjivu bateriju te mogućnost Bluetooth povezivanja.',
  },
  {
    icon: Blocks,
    title: 'Modularnost',
    text: 'Sustav brze izmjene glava omogućuje prilagodbu različitim vrstama materijala na terenu.',
  },
]

const recognitions = [
  'Zavod za forenziku Prirodoslovno-matematičkog fakulteta u Splitu omogućio im je testiranje kista na pravim ljudskim kostima, što je prošlo s vrhunskim rezultatima.',
  'Arheolozi iz Muzeja hrvatskih arheoloških spomenika (MHAS) i restauratorica Petra Perlain potvrdili su veliku korist alata u svakodnevnom radu.',
  'Suradnja s Filozofskim fakultetom u Splitu: Posebno zahvaljujemo doc. dr. sc. Ivanu Matijeviću koji nas je povezao s restauratoricom Petrom Perlain, podijelio s nama važna iskustva te nam ustupio potrebne knjige i promotivne materijale (notes, kemijske, torba za laptop). U sklopu suradnje dogovoreno je i predavanje na kojem ćemo studentima prezentirati naš projekt.',
  'Hrvatsko restauratorsko društvo (HRD), na čelu s Markom Buljanom, pozvalo je tim da svoj izum predstavi na Međunarodnoj konferenciji studija konzervacije-restauracije pred vodećim svjetskim tvrtkama, uz mogućnost financijske potpore za daljnji razvoj.',
]

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

const pametniKistImages = Array.from({ length: 19 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  return {
    src: `/images/donacije/pametni-kist/${n}.webp`,
    alt: `Startup projekt „Pametni kist” – fotografija ${i + 1}`,
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

          {/* Donation contract for legal entities */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 bg-white rounded-2xl p-5 md:p-6 border border-gray-100 shadow-sm">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Ugovor o donaciji za pravne osobe</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Donirate kao tvrtka ili pravna osoba? Preuzmite predložak ugovora o donaciji.
                </p>
              </div>
            </div>
            <a
              href={DONATION_CONTRACT_HREF}
              download
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-cyan-500 text-white font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-sm flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              Preuzmi predložak
            </a>
          </div>
        </div>
      </section>

      {/* Pametni kist – featured startup project */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Naši inovatori
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-5">
              Mladi splitski inovatori osvajaju znanstvenu scenu: upoznajte tim „Pametni kist”!
            </h2>
          </div>

          {/* Intro + team photo */}
          <div className="grid md:grid-cols-2 gap-8 items-center mb-12">
            <p className="text-gray-600 leading-relaxed order-2 md:order-1">
              Nakon velikog uspjeha ekipe CroSpec, Udruga za robotiku „Inovatic” iz Splita predstavlja još
              jednu sjajnu ekipu mladih genijalaca. Članovi tima „Pametni kist” – Vito Tonšić i Jure Vukušić,
              pod vodstvom mentora Brune Bešlića – osmislili su istoimeni revolucionarni uređaj koji spaja
              modernu tehnologiju s očuvanjem kulturne baštine.
            </p>
            <div className="order-1 md:order-2 relative aspect-[4/3] rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              <Image
                src="/images/donacije/pametni-kist/tim.webp"
                alt="Tim „Pametni kist” na Danu karijere"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>

          {/* Team members */}
          <h3 className="text-xl font-bold text-gray-900 text-center mb-6">Upoznajte članove tima</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {teamMembers.map((member) => (
              <div key={member.name} className="rounded-2xl border border-gray-100 shadow-sm bg-white p-5 flex flex-col">
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                    <Image
                      src={member.photo}
                      alt={member.name}
                      fill
                      className="object-cover object-top"
                      sizes="80px"
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900">{member.name}</h4>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-cyan-600 mt-0.5">{member.role}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{member.bio}</p>
                {member.quote && (
                  <blockquote className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-700 italic relative">
                    <Quote className="w-4 h-4 text-cyan-300 mb-1" />
                    {member.quote}
                  </blockquote>
                )}
              </div>
            ))}
          </div>

          {/* Project – innovation that preserves history */}
          <div className="rounded-2xl bg-cyan-50/50 border border-cyan-100 p-6 md:p-8 mb-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center flex-shrink-0">
                <Paintbrush className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Projekt „Pametni kist” – inovacija koja čuva povijest</h3>
            </div>
            <p className="text-gray-600 leading-relaxed mb-6">
              Pri čišćenju iznimno krhkih arheoloških nalaza, starih slika ili kostiju, i najmanji preveliki
              pritisak ruke može nepovratno uništiti povijesno blago. Projekt „Pametni kist” rješava taj problem.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {techFeatures.map((feature) => (
                <div key={feature.title} className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center mb-3">
                    <feature.icon className="w-5 h-5 text-cyan-600" />
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1.5">{feature.title}</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recognition */}
          <div className="max-w-3xl mx-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Testiran na pravim ljudskim kostima i prepoznat od struke
            </h3>
            <p className="text-gray-600 leading-relaxed mb-5">
              Ova inovacija nije ostala samo u radionici. Tim je ostvario nevjerojatne suradnje koje dokazuju
              praktičnu vrijednost uređaja:
            </p>
            <ul className="space-y-3 mb-6">
              {recognitions.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-gray-600 leading-relaxed">
              Uređaj ima puni potencijal da postane globalni startup proizvod, a mladi inovatori već su
              pripremili i patentnu prijavu kako bi u potpunosti zaštitili svoj izum. Pred splitskim timom
              „Pametni kist” bez sumnje je sjajna tehnološka budućnost!
            </p>
          </div>

          {/* Project video – Pametni kist in action */}
          <div className="max-w-3xl mx-auto mt-14 pt-10 border-t border-gray-100 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Pogledajte „Pametni kist” u akciji</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Kratka snimka prikazuje uređaj pri nježnom čišćenju krhkih stranica stare knjige.
            </p>
            <video
              controls
              // 6.6 MB clip — the poster carries the visual, so nothing is fetched
              // until the visitor presses play.
              preload="none"
              playsInline
              poster="/images/donacije/pametni-kist/video-poster.webp"
              className="mx-auto w-full max-w-[340px] rounded-2xl shadow-sm border border-gray-100 bg-black aspect-[464/832]"
            >
              <source src="/images/donacije/pametni-kist/video.mp4" type="video/mp4" />
              Vaš preglednik ne podržava reprodukciju videa.
            </video>
          </div>
        </div>
      </section>

      {/* Pametni kist gallery */}
      <section className="py-16 px-4 bg-cyan-50/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Galerija</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              Startup projekt „Pametni kist”
            </h2>
          </div>
          <DonationGallery images={pametniKistImages} />
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
