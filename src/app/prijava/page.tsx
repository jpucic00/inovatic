import type { Metadata } from 'next'
import Link from 'next/link'
import { Bot } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Prijava',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 justify-center">
            <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              <span className="text-cyan-500">Ino</span>vatic
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Prijava</h1>
          <p className="mt-2 text-sm text-gray-500">Pristup portalu za učenike i nastavnike</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form className="space-y-4" action="/api/auth/callback/credentials" method="POST">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                E-mail adresa
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="ime@primjer.hr"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Lozinka
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 transition-colors text-sm"
            >
              Prijavi se
            </button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← Natrag na početnu stranicu
          </Link>
        </div>
      </div>
    </div>
  )
}
