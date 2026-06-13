'use client'

import { useState, type ReactNode } from 'react'
import { Settings2, Eye } from 'lucide-react'

/**
 * The teacher group "Materijali" tab: one place to BOTH manage materials and
 * preview them exactly as children see them (active-module-only). Both panels
 * are server-rendered and passed in as props; we just toggle visibility so
 * switching is instant and the preview never refetches.
 */
export function MaterialsWorkspace({
  manage,
  preview,
}: Readonly<{ manage: ReactNode; preview: ReactNode }>) {
  const [tab, setTab] = useState<'manage' | 'preview'>('manage')

  const tabClass = (active: boolean) =>
    [
      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-white text-cyan-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
    ].join(' ')

  return (
    <div>
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1 mb-5">
        <button type="button" onClick={() => setTab('manage')} className={tabClass(tab === 'manage')}>
          <Settings2 className="w-4 h-4" />
          Upravljanje
        </button>
        <button type="button" onClick={() => setTab('preview')} className={tabClass(tab === 'preview')}>
          <Eye className="w-4 h-4" />
          Pregled (učenik)
        </button>
      </div>

      {tab === 'preview' ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <Eye className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Ovako učenici vide materijale ove grupe — prikazan je samo trenutno aktivan modul (prema
            kalendaru ove grupe); sakriveni materijali nisu prikazani.
          </p>
        </div>
      ) : null}

      <div className={tab === 'manage' ? '' : 'hidden'}>{manage}</div>
      <div className={tab === 'preview' ? '' : 'hidden'}>{preview}</div>
    </div>
  )
}
