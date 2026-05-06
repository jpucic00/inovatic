import type { Metadata } from 'next'
import { getMyProfile } from '@/actions/student/profile'

export const metadata: Metadata = {
  title: 'Moj profil',
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6 py-3 border-b border-gray-100">
      <dt className="text-sm font-medium text-gray-500 sm:w-48">{label}</dt>
      <dd className="text-sm text-gray-900">{value && value.trim() ? value : <span className="text-gray-400">—</span>}</dd>
    </div>
  )
}

export default async function ProfilePage() {
  const profile = await getMyProfile()
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{fullName}</h1>
      <p className="text-sm text-gray-500 mb-8">
        Ako želite promijeniti bilo koji podatak, obratite se administratoru.
      </p>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Učenik</h2>
        <dl>
          <Row label="Korisničko ime" value={profile.username} />
          <Row label="E-mail" value={profile.email} />
          <Row label="Telefon" value={profile.phone} />
          <Row label="Datum rođenja" value={profile.dateOfBirth} />
          <Row label="Škola" value={profile.childSchool} />
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Roditelj / skrbnik</h2>
        <dl>
          <Row label="Ime i prezime" value={profile.parentName} />
          <Row label="E-mail" value={profile.parentEmail} />
          <Row label="Telefon" value={profile.parentPhone} />
        </dl>
      </section>
    </div>
  )
}
