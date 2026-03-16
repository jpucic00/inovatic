import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Clock, Users, Trophy, Star, ArrowRight, Calendar } from 'lucide-react'
import { courses } from '@/lib/courses-data'
import { RobotSvg } from '@/components/shared/robot-svg'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    absolute: 'Inovatic – LEGO Robotika za djecu u Splitu',
  },
  description:
    'Udruga Inovatic uči djecu od 6 do 14 godina programiranje i robotiku kroz LEGO Spike programe u Splitu. Upišite dijete danas!',
  openGraph: {
    title: 'Inovatic – LEGO Robotika za djecu u Splitu',
    description: 'Udruga Inovatic uči djecu od 6 do 14 godina programiranje i robotiku u Splitu. Upišite dijete danas!',
    url: 'https://udruga-inovatic.hr',
  },
  alternates: { canonical: 'https://udruga-inovatic.hr' },
}

const stats = [
  { value: '2014.', label: 'Godina osnivanja', icon: Star, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-600' },
  { value: '56h', label: 'Nastave godišnje', icon: Clock, bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-600' },
  { value: '≤ 8', label: 'Djece po grupi', icon: Users, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
  { value: '4', label: 'Razine programa', icon: Trophy, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
]

const testimonials = [
  {
    quote: 'STEM je prije svega način razmišljanja i pristup odgoju i obrazovanju!',
    name: 'Romana Ban',
    role: 'Split Tech City',
  },
  {
    quote: 'Djeca uključena u STEM aktivnosti imaju drugačiji način učenja. Ona uče s razumijevanjem, ne uče napamet.',
    name: 'Dijana Barić Perić',
    role: 'Tinker Labs Split',
  },
  {
    quote: 'STEM obrazovanje pruža mladima lakše razumijevanje sadašnjeg i budućeg svijeta te pozitivno utječe na njihovu prilagodbu u današnjem društvu.',
    name: 'Jozo Pivac',
    role: 'Udruga Inovatic',
  },
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
      <circle cx={cx} cy={cy} r={innerR * 0.4} fill="transparent" stroke="none" />
      <rect x={cx - toothW / 2} y={0} width={toothW} height={toothH} rx={toothW * 0.3} fill="currentColor" />
      <rect x={cx - toothW / 2} y={size - toothH} width={toothW} height={toothH} rx={toothW * 0.3} fill="currentColor" />
      <rect x={0} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * 0.3} fill="currentColor" />
      <rect x={size - toothH} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * 0.3} fill="currentColor" />
    </svg>
  )
}

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

export default async function HomePage() {
  const latestNews = await db.article.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    take: 3,
    select: { slug: true, title: true, excerpt: true, coverImage: true, publishedAt: true, tags: { select: { tag: { select: { name: true } } } } },
  }).catch(() => [])

  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-20 px-4 overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-100 rounded-full opacity-40 blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-yellow-100 rounded-full opacity-40 blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="container mx-auto max-w-6xl relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* Left: text */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-yellow-400/20 text-yellow-800 border border-yellow-300 rounded-full text-xs sm:text-sm font-semibold mb-8">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-600 flex-shrink-0" />
                <span>Tim CroSpec – srebrna medalja WRO 2025, Singapur</span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 mb-6 leading-tight tracking-tight">
                Otkrijte svijet{' '}
                <span className="text-cyan-500">LEGO robotike</span>
              </h1>
              <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Učimo djecu od 6 do 14 godina STEM vještine kroz igru, kreativnost i programiranje.
                Splitska udruga za robotiku s tradicijom od 2014. godine.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
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

            {/* Right: robot illustration */}
            <div className="flex items-center justify-center relative py-4 lg:py-8">
              {/* Decorative gears */}
              <div className="absolute top-6 right-6 text-yellow-400 animate-spin-slow opacity-70">
                <GearDecor size={52} />
              </div>
              <div className="absolute bottom-10 left-4 text-cyan-300 animate-spin-slow-reverse opacity-60">
                <GearDecor size={32} />
              </div>
              <div className="absolute top-1/3 left-0 text-yellow-300 animate-spin-slow opacity-40">
                <GearDecor size={20} />
              </div>
              {/* Stars */}
              <div className="absolute top-8 left-16 text-yellow-400 animate-twinkle">
                <StarDecor size={18} />
              </div>
              <div className="absolute bottom-14 right-10 text-cyan-400 animate-twinkle" style={{ animationDelay: '0.8s' }}>
                <StarDecor size={14} />
              </div>
              <div className="absolute top-24 right-16 text-yellow-300 animate-twinkle" style={{ animationDelay: '1.6s' }}>
                <StarDecor size={10} />
              </div>
              {/* Robot */}
              <RobotSvg className="w-44 sm:w-56 lg:w-64 xl:w-72 animate-float drop-shadow-xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4 bg-white border-b border-gray-100">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <div
                  key={stat.label}
                  className={`text-center p-6 rounded-2xl border ${stat.bg} ${stat.border}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-3 border ${stat.border}`}>
                    <Icon className={`w-5 h-5 ${stat.text}`} />
                  </div>
                  <div className={`text-3xl font-extrabold ${stat.text} mb-1`}>{stat.value}</div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                </div>
              )
            })}
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
            {courses.map((course, i) => (
              <Link
                key={course.slug}
                href={`/programi/${course.slug}`}
                className="group block rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <div className="h-44 relative overflow-hidden">
                  <Image
                    src={course.coverImage}
                    alt={course.title}
                    fill
                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${course.gradient} opacity-70`} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center relative z-10">
                    <span className="text-5xl font-extrabold text-white/90 tracking-tight drop-shadow">
                      {course.title.split(' ').pop()}
                    </span>
                    <span className="text-xs text-white/90 font-semibold mt-1 drop-shadow">
                      {course.ageMin}–{course.ageMax} godina
                    </span>
                  </div>
                </div>
                <div className="p-5 bg-white">
                  <h3 className="font-bold text-gray-900 mb-1 text-sm">{course.title}</h3>
                  <p className="text-xs text-gray-500 mb-0.5">{course.equipment}</p>
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
      <section className="py-16 px-4 bg-gradient-to-r from-cyan-500 to-cyan-600 relative overflow-hidden">
        {/* Background decor */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10">
          <GearDecor size={180} className="text-white animate-spin-slow" />
        </div>
        <div className="absolute left-6 bottom-4 opacity-10">
          <GearDecor size={80} className="text-white animate-spin-slow-reverse" />
        </div>
        <div className="container mx-auto relative">
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

      {/* Testimonials */}
      <section className="py-16 px-4 bg-gradient-to-br from-cyan-50 via-white to-yellow-50">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="flex flex-col bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all">
                <span className="text-5xl font-serif text-cyan-400 leading-none mb-3 select-none">&ldquo;</span>
                <p className="text-gray-700 text-sm leading-relaxed flex-1 italic mb-5">{t.quote}</p>
                <div className="pt-4 border-t border-gray-100">
                  <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                  <div className="text-xs text-cyan-600">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Latest news */}
      {latestNews.length > 0 && (
        <section className="py-16 px-4 bg-white">
          <div className="container mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-2">Novosti</span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Najnovije vijesti</h2>
              </div>
              <Link href="/novosti" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 hover:underline">
                Sve vijesti <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {latestNews.map((article) => (
                <Link
                  key={article.slug}
                  href={`/novosti/${article.slug}`}
                  className="group flex flex-col rounded-2xl overflow-hidden border border-gray-100 hover:border-cyan-200 hover:shadow-lg hover:shadow-cyan-50 bg-white transition-all"
                >
                  <div className="relative h-44 overflow-hidden bg-gray-100">
                    {article.coverImage ? (
                      <Image
                        src={article.coverImage}
                        alt={article.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                        <span className="text-4xl">🤖</span>
                      </div>
                    )}
                    {article.tags.length > 0 && (
                      <span className="absolute top-3 left-3 text-xs font-semibold text-cyan-700 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full border border-cyan-100">
                        {article.tags[0].tag.name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 p-5">
                    <h3 className="font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-cyan-600 transition-colors">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="text-xs text-gray-500 line-clamp-2 flex-1 leading-relaxed mb-3">
                        {article.excerpt}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                      {article.publishedAt && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(article.publishedAt)}.
                        </div>
                      )}
                      <span className="text-xs text-cyan-500 font-semibold group-hover:underline flex items-center gap-1">
                        Čitaj <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-6 sm:hidden">
              <Link href="/novosti" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 hover:underline">
                Sve vijesti <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 px-4 bg-white relative overflow-hidden">
        {/* Small decorative robot in corner */}
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
          <RobotSvg className="w-64 translate-x-8 translate-y-8" />
        </div>
        <div className="container mx-auto text-center max-w-2xl relative">
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-16 h-16" aria-hidden="true">
              <line x1="50" y1="19" x2="43" y2="6" stroke="#AAAAAA" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="41" cy="4" r="5.5" fill="#F5A200"/>
              <circle cx="39" cy="2.5" r="2" fill="#FFD060" opacity="0.75"/>
              <polygon points="11,91 89,91 89,51 50,17 11,51" fill="#4BBDCA"/>
              <polygon points="50,17 89,51 89,91 50,54" fill="#2A9EAD" opacity="0.25"/>
              <polygon points="11,51 50,17 50,54 11,91" fill="white" opacity="0.07"/>
              <rect x="23" y="46" width="22" height="4.5" rx="2.25" fill="#2A8A9A"/>
              <rect x="55" y="46" width="22" height="4.5" rx="2.25" fill="#2A8A9A"/>
              <circle cx="34" cy="67" r="13.5" fill="#F5C018"/>
              <circle cx="66" cy="67" r="13.5" fill="#F5C018"/>
              <circle cx="34" cy="67" r="8.5" fill="#E88200"/>
              <circle cx="66" cy="67" r="8.5" fill="#E88200"/>
              <circle cx="29" cy="62" r="3.5" fill="white" opacity="0.65"/>
              <circle cx="61" cy="62" r="3.5" fill="white" opacity="0.65"/>
            </svg>
          </div>
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
