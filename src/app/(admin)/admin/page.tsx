import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Admin – Nadzorna ploča',
}

const quickLinks = [
  { href: '/admin/upiti', label: 'Upiti', description: 'Upravljanje prijavama roditelja', color: 'bg-cyan-50 border-cyan-200 hover:border-cyan-400' },
  { href: '/admin/raspored', label: 'Raspored', description: 'Grupe, termini, lokacije', color: 'bg-blue-50 border-blue-200 hover:border-blue-400' },
  { href: '/admin/tecajevi', label: 'Tečajevi', description: 'Sadržaj SLR 1–4', color: 'bg-teal-50 border-teal-200 hover:border-teal-400' },
  { href: '/admin/ucenici', label: 'Učenici', description: 'Pregled svih polaznika', color: 'bg-green-50 border-green-200 hover:border-green-400' },
  { href: '/admin/nastavnici', label: 'Nastavnici', description: 'Računi i dodjele', color: 'bg-yellow-50 border-yellow-200 hover:border-yellow-400' },
  { href: '/admin/novosti', label: 'Novosti', description: 'Objave i vijesti', color: 'bg-orange-50 border-orange-200 hover:border-orange-400' },
]

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nadzorna ploča</h1>
      <p className="text-gray-500 mb-8">Dobrodošli u admin panel Inovatic.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`block p-5 rounded-xl border-2 transition-colors ${link.color}`}
          >
            <div className="font-semibold text-gray-800 mb-1">{link.label}</div>
            <div className="text-sm text-gray-500">{link.description}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
