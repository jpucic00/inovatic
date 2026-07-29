'use client'

import { useMemo, useState } from 'react'
import { StaffMaterialList, type StaffMaterialRow } from './staff-material-list'
import { tabClass } from '@/lib/ui-classes'
import type { ProgramKind } from '@prisma/client'
import { hasModules } from '@/lib/program-kind'

interface Props {
  rows: StaffMaterialRow[]
  modules: { id: string; title: string }[]
  inGroupId: string
  kind: ProgramKind
}

type TabDef = { id: string; label: string }

export function MaterialFilterTabs({ rows, modules, inGroupId, kind }: Readonly<Props>) {
  const tabs = useMemo<TabDef[]>(() => {
    const result: TabDef[] = [{ id: '__all__', label: 'Svi' }]
    if (hasModules(kind)) {
      for (const m of modules) {
        result.push({ id: m.id, label: m.title })
      }
    }
    if (rows.some((r) => r.scope === 'COURSE')) {
      result.push({ id: '__course__', label: 'Cijeli program' })
    }
    if (rows.some((r) => r.scope === 'GROUP')) {
      result.push({ id: '__group__', label: 'Grupa' })
    }
    return result
  }, [rows, modules, kind])

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
              className={tabClass(isActive)}
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
