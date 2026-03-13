import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin – Učenici' }

export default function StudentsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Učenici</h1>
      <p className="text-gray-400 italic">Stranica u izradi.</p>
    </div>
  )
}
