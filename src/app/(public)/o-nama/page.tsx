import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Trophy, Users, MapPin, BookOpen, Award } from 'lucide-react'

export const metadata: Metadata = {
  title: 'O nama',
  description:
    'Udruga za robotiku "Inovatic" – Split, osnovana 2014. Učimo djecu robotiku i programiranje kroz LEGO Spike Prime i WeDo 2.0.',
}

const team = [
  {
    name: 'Jozo Pivac',
    role: 'Predsjednik udruge',
    description:
      'Profesor informatike i tehničke kulture. Osnivač Inovatic udruge i vizionar iza programa koji spaja zabavu s pravim STEM znanjem.',
  },
  {
    name: 'Snježana Pivac',
    role: 'Tajnica udruge',
    description:
      'Diplomirana učiteljica s dugogodišnjim iskustvom rada s djecom. Koordinira svakodnevne aktivnosti i brigu o polaznicima.',
  },
]

const competitions = [
  {
    name: 'FIRST LEGO League (FLL)',
    description: 'Globalno natjecanje u robotici i inovacijama za djecu i mlade.',
    icon: Trophy,
  },
  {
    name: 'World Robot Olympiad (WRO)',
    description: 'Jedno od najprestižnijih robotičkih natjecanja na svijetu. Naš tim CroSpec osvoji srebro 2025. u Singapuru.',
    icon: Award,
    highlight: true,
  },
  {
    name: 'Croatian Makers League',
    description: 'Hrvatsko natjecanje za mlade robotičare i makere.',
    icon: Trophy,
  },
  {
    name: 'Natjecanje mladih tehničara (NMT)',
    description: 'Nacionalno natjecanje u tehničkoj kulturi i robotici.',
    icon: Trophy,
  },
  {
    name: 'RoboCup',
    description: 'Međunarodno natjecanje u autonomnoj robotici.',
    icon: Trophy,
  },
]

const memberships = [
  { name: 'ZTK Split', full: 'Zajednica tehničke kulture Splita' },
  { name: 'HZTK', full: 'Hrvatska zajednica tehničke kulture' },
  { name: 'HROBOS', full: 'Hrvatska robotička zajednica' },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">O nama</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            Udruga za robotiku <span className="text-cyan-500">Inovatic</span>
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Od 2014. godine educiramo djecu Splita u robotici, programiranju i inženjerskom
            razmišljanju – kroz igru, istraživanje i prave izazove.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Naša priča</span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-5">
                Osnivani s ljubavlju prema STEM obrazovanju
              </h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Udruga za robotiku &quot;Inovatic&quot; osnovana je 2014. godine u Splitu s vizijom da
                  svako dijete ima pristup kvalitetnom STEM obrazovanju kroz praktičan rad i
                  istraživanje.
                </p>
                <p>
                  Vjerujemo da su djeca prirodni inženjeri i istraživači. Naš zadatak je pružiti im
                  prave alate – LEGO Spike Prime i WeDo 2.0 – i okruženje u kojemu mogu slobodno
                  eksperimentirati, griješiti i učiti iz pogrešaka.
                </p>
                <p>
                  S malim grupama (do 8 polaznika), stručnim instruktorima i strukturiranim
                  programom u 4 razine, pratimo svako dijete individualno i poticemo ga da razvije
                  vlastiti potencijal.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: '2014.', label: 'Osnivanje', icon: BookOpen },
                { value: '4', label: 'Razine programa', icon: Trophy },
                { value: '2', label: 'Lokacije u Splitu', icon: MapPin },
                { value: '≤ 8', label: 'Djece po grupi', icon: Users },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-2xl p-5 text-center">
                  <div className="text-2xl font-extrabold text-cyan-500 mb-1">{item.value}</div>
                  <div className="text-xs text-gray-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Tim</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Tko smo mi</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {team.map((member) => (
              <div key={member.name} className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg mb-4">
                  {member.name.charAt(0)}
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-0.5">{member.name}</h3>
                <p className="text-cyan-600 text-sm font-semibold mb-3">{member.role}</p>
                <p className="text-gray-600 text-sm leading-relaxed">{member.description}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
            <p className="text-gray-600 text-sm">
              Nastavu izvode i <strong>studenti i profesori Prirodoslovno-matematičkog fakulteta u Splitu</strong>,
              donoseći svježe znanje iz računarstva, fizike i inženjerstva.
            </p>
          </div>
        </div>
      </section>

      {/* Competitions */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Natjecanja</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">Gdje naši polaznici natječu</h2>
            <p className="text-gray-500">Natjecanja su nadopuna programa – razvijaju timski rad, strategiju i samopouzdanje.</p>
          </div>
          <div className="space-y-4">
            {competitions.map((comp) => (
              <div
                key={comp.name}
                className={`flex gap-4 p-5 rounded-xl border transition-colors ${
                  comp.highlight
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-100'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  comp.highlight ? 'bg-yellow-400' : 'bg-cyan-100'
                }`}>
                  <comp.icon className={`w-5 h-5 ${comp.highlight ? 'text-gray-900' : 'text-cyan-600'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-0.5">{comp.name}</h3>
                  <p className="text-sm text-gray-600">{comp.description}</p>
                  {comp.highlight && (
                    <span className="inline-block mt-2 text-xs font-bold text-yellow-800 bg-yellow-200 px-2.5 py-0.5 rounded-full">
                      Srebrna medalja WRO 2025 – Singapur
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Memberships */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">Članstvo u organizacijama</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {memberships.map((m) => (
              <div key={m.name} className="bg-white rounded-xl px-5 py-3 border border-gray-200 shadow-sm text-center">
                <div className="font-bold text-cyan-600 text-sm">{m.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{m.full}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-5">
            OIB: 83709136328 | MB: 04562704 | Adresa: Požeška 9, 21000 Split
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto text-center max-w-xl">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Pridružite se Inovatic obitelji</h2>
          <p className="text-gray-500 mb-6">
            Upišite dijete i dajte mu šansu da otkrije svoju strast prema robotici i programiranju.
          </p>
          <Link
            href="/upisi"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-cyan-500 text-white font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-sm"
          >
            Upiši dijete <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
