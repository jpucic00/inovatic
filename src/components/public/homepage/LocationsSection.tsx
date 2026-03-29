import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'

const locations = [
  {
    name: 'Velebitska 32',
    address: 'Velebitska 32, 21000 Split',
    badge: null,
    description: 'Dvije prostrane učionice namijenjene provedbi kurikuluma Svijet LEGO Robotike.',
  },
  {
    name: 'Ruđera Boškovića 33',
    address: 'Ruđera Boškovića 33, 21000 Split',
    badge: null,
    description: 'Lokacija namijenjena natjecateljskim programima.',
  },
]

export function LocationsSection() {
  return (
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
              {loc.badge && (
                <p className="text-xs font-semibold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-full px-2.5 py-0.5 inline-block mb-2">{loc.badge}</p>
              )}
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
  )
}
