'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, ClipboardCheck, Image as ImageIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type PortalTabId = 'materijali' | 'galerija' | 'evaluacija'

const TAB_DEFS: { id: PortalTabId; label: string; path: string; icon: LucideIcon }[] = [
  { id: 'materijali', label: 'Materijali', path: '', icon: BookOpen },
  { id: 'galerija', label: 'Galerija', path: '/galerija', icon: ImageIcon },
  { id: 'evaluacija', label: 'Evaluacija', path: '/evaluacija', icon: ClipboardCheck },
]

/**
 * The group's three panels, as a strip attached to the bottom edge of the
 * header card. Real routes rather than client-side panels: `/galerija` and
 * `/evaluacija` are already linked from e-mails and bookmarks, each panel keeps
 * its own data load, and the gallery's `?tab=` (which selects a MODULE) cannot
 * collide with a page-level tab param.
 */
export function PortalGroupTabs({
  groupId,
  gradable,
}: Readonly<{ groupId: string; gradable: boolean }>) {
  const pathname = usePathname()
  const base = `/portal/grupa/${groupId}`
  // Radionice are never graded, so that panel does not exist for them.
  const tabs = gradable ? TAB_DEFS : TAB_DEFS.filter((t) => t.id !== 'evaluacija')

  const activeId: PortalTabId =
    tabs.find((t) => (t.path === '' ? pathname === base : pathname.startsWith(`${base}${t.path}`)))
      ?.id ?? 'materijali'

  return (
    <div className="flex gap-0.5 overflow-x-auto px-2 sm:px-4">
      {tabs.map((tab) => {
        const isActive = activeId === tab.id
        const Icon = tab.icon
        return (
          <Link
            key={tab.id}
            href={`${base}${tab.path}`}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 -mb-px px-2 py-3 text-sm transition-colors sm:flex-none sm:justify-start sm:px-3.5',
              isActive
                ? 'border-cyan-600 font-semibold text-cyan-700'
                : 'border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
