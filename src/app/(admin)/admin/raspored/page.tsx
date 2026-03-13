import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin – Raspored' }

export default function SchedulePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Raspored i grupe</h1>
      <p className="text-gray-400 italic">Stranica u izradi.</p>
    </div>
  )
}
