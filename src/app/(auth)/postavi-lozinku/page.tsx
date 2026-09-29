import type { Metadata } from 'next'
import { Logo } from '@/components/shared/logo'
import { SetPasswordForm } from '@/components/auth/set-password-form'

export const metadata: Metadata = {
  title: 'Postavljanje lozinke',
  robots: { index: false, follow: false },
  // The token lives in the URL fragment, which a browser never puts in a
  // Referer; this keeps even the bare path out of one.
  referrer: 'no-referrer',
}

/**
 * Where a password link lands. Deliberately empty on the server: the token is
 * in the URL fragment (`#…`), which never reaches a server, so the form reads
 * it in the browser and posts it to the two throttled actions. Lives in the
 * `(auth)` group, outside the public layout, so no analytics script loads here.
 */
export default function SetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo variant="dark" className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Postavljanje lozinke</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <SetPasswordForm />
        </div>
      </div>
    </div>
  )
}
