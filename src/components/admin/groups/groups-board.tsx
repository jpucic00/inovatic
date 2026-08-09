'use client'

import { useEffect, useState, useTransition, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { ProgramFilterBar } from './program-filter-bar'
import { WeeklySchedule } from './weekly-schedule'
import { GroupTable } from './group-table'
import {
  FILTER_LABEL,
  isSingleProgramFilter,
  matchesGroupFilter,
  type GroupFilterKey,
} from '@/lib/group-filter'
import { croatianPlural } from '@/lib/format'

type Group = ComponentProps<typeof GroupTable>['data'][number]

interface GroupsBoardProps {
  groups: Group[]
  editable: boolean
  /** Resolved from `?tab=` so the /admin/programi links land on their program. */
  initialFilter: GroupFilterKey
}

/**
 * One filter over both views of the same groups: the weekly grid draws the
 * selection, the table lists it. They used to be steered separately — chips
 * over the grid, a tab strip over the table — which meant the two could
 * disagree about which program you were looking at.
 */
export function GroupsBoard({ groups, editable, initialFilter }: Readonly<GroupsBoardProps>) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeFilter, setActiveFilter] = useState<GroupFilterKey>(initialFilter)
  // A client-side nav to /admin/grupe?tab=… re-renders the page with a fresh
  // initialFilter; state alone would keep showing the previous selection.
  useEffect(() => setActiveFilter(initialFilter), [initialFilter])

  /**
   * The selection is state *and* URL. State alone kept it out of the browser's
   * history, so Back from a group landed on "Sve grupe" no matter which program
   * you had been looking at. `all` is this board's "clear", hence the bare path.
   */
  const handleFilterChange = (key: GroupFilterKey) => {
    setActiveFilter(key)
    startTransition(() => {
      router.replace(key === 'all' ? '/admin/grupe' : `/admin/grupe?tab=${key}`, {
        scroll: false,
      })
    })
  }

  const visible = groups.filter((g) => matchesGroupFilter(g, activeFilter))

  return (
    <div>
      <ProgramFilterBar groups={groups} activeFilter={activeFilter} onChange={handleFilterChange} />

      <div className="mt-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Tjedni raspored
        </h2>
        <WeeklySchedule groups={groups} activeFilter={activeFilter} />
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {FILTER_LABEL[activeFilter]}
        </h2>
        <span className="text-xs text-gray-400 tabular-nums">
          {visible.length} {croatianPlural(visible.length, 'grupa', 'grupe', 'grupa')}
        </span>
      </div>

      <GroupTable
        data={visible}
        editable={editable}
        hideProgram={isSingleProgramFilter(activeFilter)}
      />
    </div>
  )
}
