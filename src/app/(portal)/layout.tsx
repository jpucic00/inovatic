import Link from 'next/link'
import { LogOut, BookOpen, Repeat, User } from 'lucide-react'
import { auth } from '@/lib/auth'
import { logoutAction } from '@/actions/logout'
import { Logo } from '@/components/shared/logo'
import { classroomDisplayName } from '@/lib/classroom-access'
import { portalChildName, portalChoicesFor } from '@/lib/portal-children'

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // `/portal` doubles as the login screen, so this layout cannot gate: a guest
  // (or a legacy session without a city claim, which the guards fail closed on)
  // gets the bare children — the sign-in screen brings its own full-page shell.
  // Access control still holds: every portal page's data action calls
  // requirePortalChild() itself.
  const session = await auth()
  const classroom = session?.user?.role === 'CLASSROOM'
  const studentId = session?.user?.studentId ?? null
  if ((!classroom && !studentId) || !session?.user.city) {
    return <>{children}</>
  }
  // The shared classroom login is labelled by what it is, not by a name; it
  // has no profile to link to and picks programs rather than "its" groups. A
  // family session is labelled by the CHILD being looked at — the account is
  // the parent's, and with siblings the name is what says whose portal this is.
  let userName = classroomDisplayName(session.user.city)
  let canSwitch = false
  if (studentId) {
    userName = (await portalChildName(studentId)) ?? 'Korisnik'
    // "Promijeni" only when there is something to change to.
    const choices = await portalChoicesFor(session.user.id, session.user.role)
    canSwitch = choices.panels.length + choices.children.length > 1
  }

  const groupsLabel = classroom ? 'Programi' : 'Moje grupe'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal navbar */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Logo variant="dark" href="/portal" size="sm" />
          {/* Below `sm` the links go icon-only (labelled for screen readers): with
              a child's name and "Promijeni" in the bar, the full labels no
              longer fit a 375px phone. The name stays — it says whose portal
              this is. */}
          <nav className="flex items-center gap-3 sm:gap-4 min-w-0">
            <span className="text-xs text-gray-400 truncate">{userName}</span>
            <Link href="/portal" aria-label={groupsLabel} className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5 shrink-0">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{groupsLabel}</span>
            </Link>
            {canSwitch && (
              <Link href="/portal/odabir" aria-label="Promijeni" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5 shrink-0">
                <Repeat className="w-4 h-4" />
                <span className="hidden sm:inline">Promijeni</span>
              </Link>
            )}
            {classroom ? null : (
              <Link href="/portal/profil" aria-label="Profil" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5 shrink-0">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Profil</span>
              </Link>
            )}
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
    </div>
  )
}
