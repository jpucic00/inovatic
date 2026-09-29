import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, LogOut, Presentation, UserRound } from 'lucide-react'

import { auth } from '@/lib/auth'
import { logoutAction } from '@/actions/logout'
import { selectPortalChild } from '@/actions/portal-choice'
import { Logo } from '@/components/shared/logo'
import { portalChoicesFor } from '@/lib/portal-children'
import { panelPath, type PortalPanel } from '@/lib/portal-landing'

export const metadata: Metadata = {
  title: 'Odabir',
  robots: { index: false, follow: false },
}

const PANEL_LABEL: Record<PortalPanel, string> = {
  admin: 'Administracija',
  teacher: 'Nastavnički panel',
}

const PANEL_ICON: Record<PortalPanel, typeof LayoutDashboard> = {
  admin: LayoutDashboard,
  teacher: Presentation,
}

const choiceClass =
  'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-colors text-left'
const idleClass = 'border-gray-200 text-gray-700 hover:border-cyan-500 hover:text-cyan-600'
const currentClass = 'border-cyan-300 bg-cyan-50 text-cyan-700'

/**
 * Everything one login can open: its staff panels and the children linked to
 * it. Reached after login whenever there is more than one option, and from the
 * portal header's "Promijeni dijete". Lives in the `(auth)` route group, not
 * `(portal)`, and renders its own shell: the portal chrome names the picked
 * child, and on this page there may be none yet — or staff, who have no portal
 * chrome at all.
 */
export default async function PortalChoicePage() {
  const session = await auth()
  if (!session?.user?.city) redirect('/portal')
  if (session.user.role === 'CLASSROOM') redirect('/portal')

  const { panels, children } = await portalChoicesFor(session.user.id, session.user.role)
  const current = session.user.studentId

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo variant="dark" className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Odaberite</h1>
          <p className="mt-2 text-sm text-gray-500">{session.user.email}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
          {panels.map((panel) => {
            const Icon = PANEL_ICON[panel]
            return (
              <Link key={panel} href={panelPath(panel)} className={`${choiceClass} ${idleClass}`}>
                <Icon className="w-4 h-4 text-cyan-500" />
                {PANEL_LABEL[panel]}
              </Link>
            )
          })}

          {children.length > 0 && panels.length > 0 && (
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Portal djeteta</p>
          )}

          {children.map((child) => (
            <form key={child.id} action={selectPortalChild.bind(null, child.id)}>
              <button
                type="submit"
                aria-current={child.id === current ? 'true' : undefined}
                className={`${choiceClass} ${child.id === current ? currentClass : idleClass}`}
              >
                <UserRound className="w-4 h-4 text-cyan-500" />
                {child.firstName} {child.lastName}
              </button>
            </form>
          ))}

          {panels.length === 0 && children.length === 0 && (
            <p className="text-sm text-gray-500 text-center">
              Nijedno vaše dijete trenutno nije upisano u program. Ako mislite da je ovo greška, javite nam se.
            </p>
          )}

          <form action={logoutAction} className="pt-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600"
            >
              <LogOut className="w-4 h-4" />
              Odjava
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
