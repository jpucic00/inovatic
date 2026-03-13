import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Clock, Users, Trophy, Star, ArrowRight } from 'lucide-react'
import { courses } from '@/lib/courses-data'

export const metadata: Metadata = {
  title: 'Inovatic – LEGO Robotika za djecu u Splitu',
  description:
    'Udruga Inovatic uči djecu od 6 do 14 godina programiranje i robotiku kroz LEGO Spike Prime i WeDo 2.0 programe u Splitu. Upišite dijete danas!',
}

const stats = [
  { value: '2014.', label: 'Godina osnivanja', icon: Star },
  { value: '56h', label: 'Nastave godišnje', icon: Clock },
  { value: '≤ 8', label: 'Djece po grupi', icon: Users },
  { value: '4', label: 'Razine programa', icon: Trophy },
]

const locations = [
  {
    name: 'Velebitska 32',
    address: 'Velebitska 32, 21000 Split',
    description: 'Prostrana učionica u središtu Splita s modernom opremom.',
  },
  {
    name: 'Ruđera Boškovića 33',
    address: 'Ruđera Boškovića 33, 21000 Split',
    description: 'Druga lokacija s potpuno opremljenim robotičkim laboratorijem.',
  },
]

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-24 px-4 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-100 rounded-full opacity-40 blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-yellow-100 rounded-full opacity-40 blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="container mx-auto text-center max-w-3xl relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-400/20 text-yellow-800 border border-yellow-300 rounded-full text-sm font-semibold mb-8">
            <Trophy className="w-4 h-4 text-yellow-600" />
            Tim CroSpec – srebrna medalja WRO 2025, Singapur
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6 leading-tight tracking-tight">
            Otkrijte svijet{' '}
            <span className="text-cyan-500">LEGO robotike</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-2xl mx-auto">
            Učimo djecu od 6 do 14 godina STEM vještine kroz igru, kreativnost i programiranje.
            Splitska udruga za robotiku s tradicijom od 2014. godine.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/upisi"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-cyan-500 text-white font-semibold rounded-xl hover:bg-cyan-600 transition-colors shadow-md text-base"
            >
              Upiši dijete <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/programi"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-cyan-600 font-semibold rounded-xl border-2 border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50 transition-colors text-base"
            >
              Pogledaj programe
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4 bg-white border-b border-gray-100">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center p-6 rounded-2xl bg-gray-50">
                <div className="text-3xl font-extrabold text-cyan-500 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Courses */}
      <section className="py-20 px-4 bg-white">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Programi</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
              Četiri razine – jedan put naprijed
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-lg">
              Od prvih koraka u mehanici do simulacije industrijskih sustava. Svaka razina prilagođena je dobi i predznanju djeteta.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {courses.map((course) => (
              <Link
                key={course.slug}
                href={`/programi/${course.slug}`}
                className="group block rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <div className={`bg-gradient-to-br ${course.gradient} h-32 flex items-center justify-center`}>
                  <span className="text-4xl font-extrabold text-white/90 tracking-tight">
                    {course.title.split(' ').pop()}
                  </span>
                </div>
                <div className="p-5 bg-white">
                  <h3 className="font-bold text-gray-900 mb-1 text-sm">{course.title}</h3>
                  <p className="text-xs text-gray-500 mb-0.5">{course.ageMin}–{course.ageMax} god. | {course.equipment}</p>
                  <p className="text-xs text-cyan-500 font-semibold mt-3 group-hover:underline flex items-center gap-1">
                    Saznaj više <ArrowRight className="w-3 h-3" />
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/programi"
              className="inline-flex items-center gap-2 text-cyan-600 font-semibold hover:underline"
            >
              Usporedi sve programe <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Achievement highlight */}
      <section className="py-16 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Trophy className="w-12 h-12 text-yellow-300 mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Tim CroSpec – WRO 2025 Singapur
            </h2>
            <p className="text-cyan-100 text-lg mb-6 leading-relaxed">
              Naši polaznici su 2025. godine nastupili na World Robot Olympiad finalima u Singapuru
              i <strong className="text-white">osvoji srebrnu medalju</strong>. Jedan od najuspješnijih timova na svijetu.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              {['FLL', 'WRO', 'Croatian Makers League', 'NMT', 'RoboCup'].map((comp) => (
                <span key={comp} className="px-3 py-1.5 bg-white/20 text-white rounded-full font-medium">
                  {comp}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Locations */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Lokacije</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Dvije lokacije u Splitu</h2>
            <p className="text-gray-500 max-w-lg mx-auto">Nastava se odvija jednom tjedno, 90 minuta, u malim grupama do 8 polaznika.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {locations.map((loc) => (
              <div key={loc.name} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mb-4">
                  <MapPin className="w-5 h-5 text-cyan-500" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">{loc.name}</h3>
                <p className="text-sm text-cyan-600 mb-2">{loc.address}</p>
                <p className="text-sm text-gray-500">{loc.description}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/kontakt" className="inline-flex items-center gap-2 text-cyan-600 font-semibold hover:underline text-sm">
              Pogledaj kartu i kontakt <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-white">
        <div className="container mx-auto text-center max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Zainteresirani ste?
          </h2>
          <p className="text-gray-500 mb-8 text-lg">
            Ispunite kratku prijavu i mi ćemo vas kontaktirati s raspoloživim terminima. Bez obaveza.
          </p>
          <Link
            href="/upisi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-base"
          >
            Pošalji upit <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-sm text-gray-400">
            ili nas kontaktirajte na{' '}
            <a href="mailto:prijave@udruga-inovatic.hr" className="text-cyan-500 hover:underline">
              prijave@udruga-inovatic.hr
            </a>
          </p>
        </div>
      </section>
    </>
  )
}
