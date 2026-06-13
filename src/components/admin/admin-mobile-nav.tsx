'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut, LayoutDashboard, Inbox, Users2, BookOpen, MapPin, Users, GraduationCap, Newspaper, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'
import { logoutAction } from '@/actions/logout'
import { SchoolYearSwitcher } from '@/components/admin/school-year-switcher'

const navGroups = [
  {
    label: 'Školska godina',
    links: [
      { href: '/admin/skolska-godina', label: 'Kalendar', icon: CalendarDays },
      { href: '/admin/upiti', label: 'Upiti', icon: Inbox },
      { href: '/admin/grupe', label: 'Grupe', icon: Users2 },
      { href: '/admin/programi', label: 'Programi', icon: BookOpen },
    ],
  },
  {
    label: 'Općenito',
    links: [
      { href: '/admin', label: 'Nadzorna ploča', icon: LayoutDashboard },
      { href: '/admin/ucenici', label: 'Učenici', icon: GraduationCap },
      { href: '/admin/nastavnici', label: 'Nastavnici', icon: Users },
      { href: '/admin/lokacije', label: 'Lokacije', icon: MapPin },
      { href: '/admin/novosti', label: 'Novosti', icon: Newspaper },
    ],
  },
]

function NavLinks({ pathname, onNavigate }: Readonly<{ pathname: string; onNavigate?: () => void }>) {
  return (
    <>
      {navGroups.map((group, groupIndex) => (
        <div
          key={group.label}
          className={cn('space-y-1', groupIndex > 0 && 'mt-4 pt-4 border-t border-gray-800')}
        >
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {group.label}
          </p>
          {group.links.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </>
  )
}

function UserFooter({ userName }: Readonly<{ userName: string }>) {
  return (
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
  )
}

interface AdminNavProps {
  userName: string
  years: string[]
  selectedYear: string
  currentYear: string
}

export function AdminDesktopSidebar({
  userName,
  years,
  selectedYear,
  currentYear,
}: Readonly<AdminNavProps>) {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex w-60 bg-gray-900 text-gray-300 flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <Logo variant="white" href="/admin" size="sm" />
      </div>
      <SchoolYearSwitcher years={years} selectedYear={selectedYear} currentYear={currentYear} />
      <nav className="flex-1 py-4 px-2">
        <NavLinks pathname={pathname} />
      </nav>
      <UserFooter userName={userName} />
    </aside>
  )
}

export function AdminMobileNav({
  userName,
  years,
  selectedYear,
  currentYear,
}: Readonly<AdminNavProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 h-14 bg-gray-900 flex items-center justify-between px-4 lg:hidden">
        <Logo variant="white" href="/admin" size="sm" />
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="text-gray-300 hover:text-white p-1"
          aria-label="Otvori izbornik"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {isOpen && (
        <dialog
          open
          className="fixed inset-0 z-50 bg-gray-900 text-gray-300 flex flex-col lg:hidden w-full h-full max-w-full max-h-full m-0 p-0 border-none"
          aria-label="Navigacija"
        >
          <div className="h-14 px-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
            <Logo variant="white" href="/admin" size="sm" />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-gray-300 hover:text-white p-1"
              aria-label="Zatvori izbornik"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <SchoolYearSwitcher years={years} selectedYear={selectedYear} currentYear={currentYear} />
          <div className="flex-1 py-4 px-2 overflow-y-auto">
            <NavLinks pathname={pathname} onNavigate={() => setIsOpen(false)} />
          </div>
          <UserFooter userName={userName} />
        </dialog>
      )}
    </>
  )
}
