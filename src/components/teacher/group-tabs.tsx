'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type TeacherTabId = 'polaznici' | 'materijali' | 'dolazak' | 'galerija'

const TAB_DEFS: { id: TeacherTabId; label: string; path: string }[] = [
  { id: 'polaznici', label: 'Polaznici', path: '' },
  { id: 'dolazak', label: 'Dolazak', path: '/dolazak' },
  { id: 'materijali', label: 'Materijali', path: '/materijali' },
  { id: 'galerija', label: 'Galerija', path: '/galerija' },
]

export function GroupTabs({ groupId }: Readonly<{ groupId: string }>) {
  const pathname = usePathname()
  const base = `/nastavnik/grupa/${groupId}`
  const tabs = TAB_DEFS

  const activeId: TeacherTabId =
    tabs.find((t) => {
      if (t.path === '') {
        // Default tab = the bare group URL (optionally with /polaznik/... etc.
        // sub-paths that also belong to Polaznici).
        return pathname === base || pathname.startsWith(`${base}/polaznik`)
      }
      return pathname === `${base}${t.path}` || pathname.startsWith(`${base}${t.path}/`)
    })?.id ?? 'polaznici'

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
      {tabs.map((tab) => {
        const href = `${base}${tab.path}`
        const isActive = activeId === tab.id
        return (
          <Link
            key={tab.id}
            href={href}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px whitespace-nowrap transition-colors',
              isActive
                ? 'border-cyan-600 text-cyan-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
