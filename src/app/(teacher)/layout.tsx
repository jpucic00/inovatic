import Link from 'next/link'
import { Users, LogOut } from 'lucide-react'
import { requireTeacher } from '@/lib/auth-guard'
import { logoutAction } from '@/actions/logout'
import { Logo } from '@/components/shared/logo'

export default async function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireTeacher()
  const userName = session.user.name ?? session.user.email ?? 'Nastavnik'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Logo variant="dark" href="/nastavnik" size="sm" />
          <nav className="flex items-center gap-4">
            <span className="text-xs text-gray-400">{userName}</span>
            <Link href="/nastavnik" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Moje grupe
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
