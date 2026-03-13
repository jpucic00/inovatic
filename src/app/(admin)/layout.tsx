import Link from 'next/link'
import { Bot, LayoutDashboard, Inbox, Calendar, BookOpen, Users, GraduationCap, Newspaper, LogOut } from 'lucide-react'

const sidebarLinks = [
  { href: '/admin', label: 'Nadzorna ploča', icon: LayoutDashboard },
  { href: '/admin/upiti', label: 'Upiti', icon: Inbox },
  { href: '/admin/raspored', label: 'Raspored', icon: Calendar },
  { href: '/admin/tecajevi', label: 'Tečajevi', icon: BookOpen },
  { href: '/admin/ucenici', label: 'Učenici', icon: GraduationCap },
  { href: '/admin/nastavnici', label: 'Nastavnici', icon: Users },
  { href: '/admin/novosti', label: 'Novosti', icon: Newspaper },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-gray-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-800">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-cyan-500 rounded-md flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-sm">
              <span className="text-cyan-400">Ino</span>vatic Admin
            </span>
          </Link>
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

        <div className="px-2 py-4 border-t border-gray-800">
          <form action="/api/auth/signout" method="POST">
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
    </div>
  )
}
