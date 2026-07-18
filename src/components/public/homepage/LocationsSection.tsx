import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'

const locations = [
  {
    address: 'Velebitska 32, 21000 Split',
    venue: 'Anića zgrada',
    href: '/lokacije/split',
    badge: null,
    description: 'Dvije prostrane učionice namijenjene provedbi kurikuluma Svijet LEGO Robotike.',
  },
  {
    address: 'Ruđera Boškovića 33, 21000 Split',
    venue: 'Prirodoslovno-matematički fak.',
    href: '/lokacije/split',
    badge: null,
    description: 'Lokacija namijenjena natjecateljskim programima.',
  },
  {
    address: 'Velimira Škorpika 7/a, 22000 Šibenik',
    venue: 'Trokut Šibenik – centar poduzetništva',
    href: '/lokacije/sibenik',
    badge: 'Novo',
    description: 'Naša nova lokacija u Šibeniku – isti kurikulum Svijet LEGO Robotike.',
  },
]

export function LocationsSection() {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Lokacije</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Lokacije u Splitu i Šibeniku</h2>
          <p className="text-gray-500 max-w-lg mx-auto">Nastava se odvija jednom tjedno, u malim grupama do 10 polaznika.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {locations.map((loc) => (
            <Link key={loc.address} href={loc.href} className="relative overflow-hidden bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-cyan-100 transition-all">
              {loc.badge === 'Novo' && (
                <span className="pointer-events-none absolute -right-12 top-5 w-40 rotate-45 bg-yellow-400 py-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-yellow-950 shadow-sm">
                  Novo
                </span>
              )}
              <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mb-4">
                <MapPin className="w-5 h-5 text-cyan-500" />
              </div>
              <h3 className={`font-bold text-gray-900 mb-1${loc.badge === 'Novo' ? ' pr-14' : ''}`}>{loc.address}</h3>
              <p className="text-xs text-cyan-600 mb-2">{loc.venue}</p>
              <p className="text-sm text-gray-500">{loc.description}</p>
            </Link>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/lokacije" className="inline-flex items-center gap-2 text-cyan-600 font-semibold hover:underline text-sm">
            Pogledaj sve lokacije i kontakt <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
