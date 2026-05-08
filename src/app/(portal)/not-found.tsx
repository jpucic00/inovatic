import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PortalNotFound() {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-3">
        Stranica nije pronađena
      </h1>
      <p className="text-gray-500 mb-6">
        Tražena stranica ne postoji ili nemate pristup.
      </p>
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na moje grupe
      </Link>
    </div>
  )
}
