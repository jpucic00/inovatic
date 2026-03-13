import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Moj profil',
}

export default function ProfilePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Moj profil</h1>
      <p className="text-gray-400 italic">Stranica u izradi.</p>
    </div>
  )
}
