import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Prijava',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo variant="dark" className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Prijava</h1>
          <p className="mt-2 text-sm text-gray-500">Pristup portalu za učenike i nastavnike</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <LoginForm />
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            &larr; Natrag na početnu stranicu
          </Link>
        </div>
      </div>
    </div>
  )
}
