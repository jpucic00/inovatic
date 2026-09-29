import type { Metadata } from 'next'
import { requireTeacher } from '@/lib/auth-guard'
import { ChangePasswordForm } from '@/components/shared/change-password-form'

export const metadata: Metadata = { title: 'Lozinka' }

export default async function ChangePasswordPage() {
  const session = await requireTeacher()
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Lozinka</h1>
      <p className="text-sm text-gray-500 mb-6">
        Prijava: <strong>{session.user.email}</strong>. Nakon promjene ostali uređaji na kojima ste
        prijavljeni bit će odjavljeni.
      </p>
      <div className="bg-white rounded-xl border p-6">
        <ChangePasswordForm email={session.user.email ?? ''} />
      </div>
    </div>
  )
}
