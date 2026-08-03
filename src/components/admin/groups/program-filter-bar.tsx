'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import {
  FILTER_LABEL,
  LEVEL_FILTERS,
  filterPalette,
  matchesGroupFilter,
  type GroupFilterKey,
  type Palette,
  type ProgramRef,
} from '@/lib/group-filter'

interface FilterChipProps {
  label: string
  count: number
  palette: Palette
  isActive: boolean
  onClick: () => void
}

/**
 * Deliberately shaped like a control, not a legend: raised white pill, hover
 * lift, filled + ringed when on, and a live count so it is obvious the chip
 * does something to the schedule and table below.
 */
function FilterChip({ label, count, palette, isActive, onClick }: Readonly<FilterChipProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        palette.ring,
        isActive
          ? `${palette.active} shadow`
          : 'border-gray-300 bg-white text-gray-700 shadow-sm hover:-translate-y-px hover:border-gray-400 hover:shadow',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${isActive ? 'bg-white/90' : palette.dot}`}
      />
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
          isActive ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

interface ProgramFilterBarProps {
  groups: { course: ProgramRef }[]
  activeFilter: GroupFilterKey
  onChange: (key: GroupFilterKey) => void
}

export function ProgramFilterBar({
  groups,
  activeFilter,
  onChange,
}: Readonly<ProgramFilterBarProps>) {
  const countOf = (key: GroupFilterKey) =>
    groups.filter((g) => matchesGroupFilter(g, key)).length

  // A chip that covers everything is just a second "Sve grupe", and one nothing
  // matches is a dead end — neither earns a place on the bar. The active chip is
  // the exception: a `?tab=` link can select a program this year has no group
  // for, and dropping it would leave the bar disagreeing with the table.
  const kindChips = (['standard', 'competition', 'radionice'] as const)
    .map((key) => ({ key, count: countOf(key) }))
    .filter(({ key, count }) => key === activeFilter || (count > 0 && count < groups.length))
  const levelChips = LEVEL_FILTERS
    .map((f) => ({ ...f, count: countOf(f.key) }))
    .filter((f) => f.key === activeFilter || f.count > 0)

  const chip = (key: GroupFilterKey, count: number) => (
    <FilterChip
      key={key}
      label={FILTER_LABEL[key]}
      count={count}
      palette={filterPalette(key)}
      isActive={activeFilter === key}
      onClick={() => onChange(key)}
    />
  )

  const standard = kindChips.find((c) => c.key === 'standard')
  const otherKinds = kindChips.filter((c) => c.key !== 'standard')

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Prikaži
      </span>

      <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0">
        <legend className="sr-only">Filtriraj grupe po programu</legend>
        {chip('all', groups.length)}
        {standard && chip('standard', standard.count)}
        {levelChips.map((f) => chip(f.key, f.count))}
        {otherKinds.length > 0 && (
          <span className="mx-0.5 h-5 w-px bg-gray-300" aria-hidden />
        )}
        {otherKinds.map((c) => chip(c.key, c.count))}
      </fieldset>

      {activeFilter !== 'all' && (
        <button
          type="button"
          onClick={() => onChange('all')}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-800"
        >
          <X className="h-3 w-3" aria-hidden />
          Poništi filter
        </button>
      )}
    </div>
  )
}
