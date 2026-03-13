import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin – Novosti' }

export default function ArticlesAdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Novosti</h1>
      <p className="text-gray-400 italic">Stranica u izradi.</p>
    </div>
  )
}
