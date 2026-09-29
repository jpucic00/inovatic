import Link from 'next/link'
import { Users, LogOut, LayoutDashboard, KeyRound } from 'lucide-react'
import { Toaster } from '@/components/ui/toaster'
import { requireTeacher } from '@/lib/auth-guard'
import { logoutAction } from '@/actions/logout'
import { Logo } from '@/components/shared/logo'

export default async function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireTeacher()
  const userName = session.user.name ?? session.user.email ?? 'Nastavnik'
  // Admins pass through requireTeacher for support (e.g. the dual-role Šibenik
  // admin) — give them a way back to their own panel.
  const isAdmin = session.user.role === 'ADMIN'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Logo variant="dark" href="/nastavnik" size="sm" />
          {/* Icon-only below `sm` (labelled for screen readers), as in the
              portal header — with "Lozinka" added the labels no longer fit a
              phone, and a teacher marks attendance on one. */}
          <nav className="flex items-center gap-3 sm:gap-4 min-w-0">
            <span className="text-xs text-gray-400 truncate">{userName}</span>
            {isAdmin && (
              <Link href="/admin" aria-label="Administracija" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5 shrink-0">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Administracija</span>
              </Link>
            )}
            <Link href="/nastavnik" aria-label="Moje grupe" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5 shrink-0">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Moje grupe</span>
            </Link>
            <Link href="/nastavnik/lozinka" aria-label="Lozinka" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5 shrink-0">
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline">Lozinka</span>
            </Link>
            <form action={logoutAction} className="shrink-0">
              <button type="submit" aria-label="Odjava" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Odjava</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      <Toaster />
    </div>
  )
}
