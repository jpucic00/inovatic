import Link from 'next/link'
import { LogOut, BookOpen, User } from 'lucide-react'
import { auth } from '@/lib/auth'
import { logoutAction } from '@/actions/logout'
import { Logo } from '@/components/shared/logo'

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // `/portal` doubles as the login screen, so this layout cannot gate: a guest
  // (or a legacy session without a city claim, which the guards fail closed on)
  // gets the bare children — the sign-in screen brings its own full-page shell.
  // Access control still holds: every portal page's data action calls
  // requireStudent() itself.
  const session = await auth()
  if (session?.user?.role !== 'STUDENT' || !session.user.city) {
    return <>{children}</>
  }
  const userName = session.user.name ?? session.user.email ?? 'Korisnik'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal navbar */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Logo variant="dark" href="/portal" size="sm" />
          <nav className="flex items-center gap-4">
            <span className="text-xs text-gray-400">{userName}</span>
            <Link href="/portal" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              Moje grupe
            </Link>
            <Link href="/portal/profil" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5">
              <User className="w-4 h-4" />
              Profil
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5">
                <LogOut className="w-4 h-4" />
                Odjava
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
