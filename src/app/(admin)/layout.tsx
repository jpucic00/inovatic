import Link from 'next/link'
import { LayoutDashboard, Inbox, Calendar, BookOpen, Users, GraduationCap, Newspaper, LogOut } from 'lucide-react'
import { Toaster } from 'sonner'
import { requireAdmin } from '@/lib/auth-guard'
import { logoutAction } from '@/actions/logout'
import { Logo } from '@/components/shared/logo'

const sidebarLinks = [
  { href: '/admin', label: 'Nadzorna ploča', icon: LayoutDashboard },
  { href: '/admin/upiti', label: 'Upiti', icon: Inbox },
  { href: '/admin/raspored', label: 'Raspored', icon: Calendar },
  { href: '/admin/tecajevi', label: 'Tečajevi', icon: BookOpen },
  { href: '/admin/ucenici', label: 'Učenici', icon: GraduationCap },
  { href: '/admin/nastavnici', label: 'Nastavnici', icon: Users },
  { href: '/admin/novosti', label: 'Novosti', icon: Newspaper },
]

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdmin()
  const userName = session.user.name ?? session.user.email ?? 'Admin'

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-gray-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-800">
          <Logo variant="white" href="/admin" size="sm" />
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          {sidebarLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 text-sm rounded-md text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-gray-800">
          <div className="px-2 mb-3">
            <p className="text-xs text-gray-500 truncate">{userName}</p>
            <p className="text-xs text-gray-600">Administrator</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Odjava
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-8">{children}</main>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  )
}
