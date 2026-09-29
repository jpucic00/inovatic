import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { LoginForm } from '@/components/auth/login-form'
import { cityInboxEmail } from '@/lib/email/client'

/**
 * The full-page sign-in screen. Rendered by `/portal` for visitors without a
 * usable session — that route doubles as the login URL, so this screen has no
 * page of its own.
 */
export function LoginScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo variant="dark" className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Prijava</h1>
          <p className="mt-2 text-sm text-gray-500">Pristup portalu za roditelje i djelatnike</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <LoginForm />
        </div>

        {/* No self-service reset, by design: a public "forgot password" form is
            one more thing for the bots already hammering this page to abuse.
            Staff send a new link from the profile instead. */}
        <p className="mt-4 text-center text-xs text-gray-500">
          Zaboravili ste lozinku ili još nemate pristup? Javite nam se na{' '}
          <a href={`mailto:${cityInboxEmail('SPLIT')}`} className="text-cyan-600 hover:underline">
            {cityInboxEmail('SPLIT')}
          </a>{' '}
          (Split) ili{' '}
          <a href={`mailto:${cityInboxEmail('SIBENIK')}`} className="text-cyan-600 hover:underline">
            {cityInboxEmail('SIBENIK')}
          </a>{' '}
          (Šibenik) i poslat ćemo vam poveznicu za novu lozinku.
        </p>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            &larr; Natrag na početnu stranicu
          </Link>
        </div>
      </div>
    </div>
  )
}
