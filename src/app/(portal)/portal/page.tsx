import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Portal – Moje grupe',
}

export default function PortalDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dobrodošli u portal</h1>
      <p className="text-gray-500 mb-8">Ovdje možete pristupiti materijalima za svoju grupu.</p>
      <p className="text-gray-400 italic">Portal u izradi.</p>
    </div>
  )
}
