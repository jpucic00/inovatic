import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nastavnik – Moje grupe',
}

export default function TeacherDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Moje grupe</h1>
      <p className="text-gray-500 mb-8">Pregled i upravljanje grupama kojima ste dodijeljeni.</p>
      <p className="text-gray-400 italic">Panel nastavnika u izradi.</p>
    </div>
  )
}
