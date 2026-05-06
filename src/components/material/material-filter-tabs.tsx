'use client'

import { useMemo, useState } from 'react'
import { StaffMaterialList, type StaffMaterialRow } from './staff-material-list'

interface Props {
  rows: StaffMaterialRow[]
  modules: { id: string; title: string }[]
  inGroupId: string
  isCustom: boolean
}

type TabDef = { id: string; label: string }

export function MaterialFilterTabs({ rows, modules, inGroupId, isCustom }: Readonly<Props>) {
  const tabs = useMemo<TabDef[]>(() => {
    const result: TabDef[] = [{ id: '__all__', label: 'Svi' }]
    if (isCustom) {
      if (rows.some((r) => r.scope === 'COURSE')) {
        result.push({ id: '__course__', label: 'Radionica' })
      }
    } else {
      for (const m of modules) {
        result.push({ id: m.id, label: m.title })
      }
    }
    if (rows.some((r) => r.scope === 'GROUP')) {
      result.push({ id: '__group__', label: 'Grupa' })
    }
    return result
  }, [rows, modules, isCustom])

  const [activeTab, setActiveTab] = useState('__all__')

  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : '__all__'

  const filtered = useMemo(() => {
    if (resolvedTab === '__all__') return rows
    if (resolvedTab === '__group__') return rows.filter((r) => r.scope === 'GROUP')
    if (resolvedTab === '__course__') return rows.filter((r) => r.scope === 'COURSE')
    return rows.filter((r) => r.scope === 'MODULE' && r.moduleId === resolvedTab)
  }, [rows, resolvedTab])

  const countFor = (tabId: string) => {
    if (tabId === '__all__') return rows.length
    if (tabId === '__group__') return rows.filter((r) => r.scope === 'GROUP').length
    if (tabId === '__course__') return rows.filter((r) => r.scope === 'COURSE').length
    return rows.filter((r) => r.scope === 'MODULE' && r.moduleId === tabId).length
  }

  if (tabs.length <= 1) {
    return <StaffMaterialList rows={rows} inGroupId={inGroupId} />
  }

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === resolvedTab
          const count = countFor(tab.id)
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px whitespace-nowrap transition-colors',
                isActive
                  ? 'border-cyan-600 text-cyan-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label} ({count})
            </button>
          )
        })}
      </div>

      <StaffMaterialList rows={filtered} inGroupId={inGroupId} />
    </div>
  )
}
