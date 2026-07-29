'use client'

import { useState } from 'react'
import { assignLanes } from '@/lib/calendar-lanes'
import type { ProgramKind } from '@prisma/client'
import { isRadionica } from '@/lib/program-kind'

const DAYS = ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja']
const DAY_SHORT = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned']

const PX_PER_MIN = 0.9
const HEADER_HEIGHT = 26
const DEFAULT_DURATION = 90
const BODY_PAD = 10
// Stretches of the day with no group on any weekday (typically the gap between the
// morning and afternoon blocks) shrink to a short band instead of dead scroll space.
const COLLAPSE_FROM_HOURS = 2
const COLLAPSED_BAND_HEIGHT = 30

type FilterKey = 'all' | 'SLR_1' | 'SLR_2' | 'SLR_3' | 'SLR_4'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Sve grupe' },
  { key: 'SLR_1', label: 'SLR 1' },
  { key: 'SLR_2', label: 'SLR 2' },
  { key: 'SLR_3', label: 'SLR 3' },
  { key: 'SLR_4', label: 'SLR 4' },
]

function parseTime(t: string): number {
  const parts = t.split(':')
  return Number.parseInt(parts[0] ?? '0') * 60 + Number.parseInt(parts[1] ?? '0')
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function courseColor(level: string | null) {
  switch (level) {
    case 'SLR_1': return { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-800', dot: 'bg-cyan-500', active: 'bg-cyan-500 text-white', inactive: 'bg-cyan-50 text-cyan-700 border border-cyan-200' }
    case 'SLR_2': return { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800', dot: 'bg-green-500', active: 'bg-green-500 text-white', inactive: 'bg-green-50 text-green-700 border border-green-200' }
    case 'SLR_3': return { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-800', dot: 'bg-amber-500', active: 'bg-amber-500 text-white', inactive: 'bg-amber-50 text-amber-700 border border-amber-200' }
    case 'SLR_4': return { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800', dot: 'bg-purple-500', active: 'bg-purple-500 text-white', inactive: 'bg-purple-50 text-purple-700 border border-purple-200' }
    default: return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700', dot: 'bg-gray-400', active: 'bg-gray-500 text-white', inactive: 'bg-gray-50 text-gray-600 border border-gray-200' }
  }
}

function filterColor(key: FilterKey) {
  switch (key) {
    case 'SLR_1': return courseColor('SLR_1')
    case 'SLR_2': return courseColor('SLR_2')
    case 'SLR_3': return courseColor('SLR_3')
    case 'SLR_4': return courseColor('SLR_4')
    default: return null
  }
}

function matchesFilter(g: { course: { level: string | null } }, filter: FilterKey): boolean {
  if (filter === 'all') return true
  return g.course.level === filter
}

type TimeBand = { start: number; end: number; collapsed: boolean; top: number; height: number }

/** Splits [minTime, maxTime) into hour runs, collapsing the long empty ones. */
function buildTimeBands(
  bounds: { start: number; end: number }[],
  minTime: number,
  maxTime: number,
): TimeBand[] {
  const runs: { start: number; end: number; busy: boolean }[] = []
  // A group saved with endTime <= startTime can collapse the bounds onto a single
  // hour; always emit at least one band so the grid degrades instead of throwing.
  const upper = Math.max(maxTime, minTime + 60)
  for (let t = minTime; t < upper; t += 60) {
    const busy = bounds.some((b) => b.start < t + 60 && b.end > t)
    const last = runs.at(-1)
    if (last?.busy === busy) last.end = t + 60
    else runs.push({ start: t, end: t + 60, busy })
  }

  let top = BODY_PAD
  return runs.map((run) => {
    const collapsed = !run.busy && run.end - run.start >= COLLAPSE_FROM_HOURS * 60
    const height = collapsed ? COLLAPSED_BAND_HEIGHT : (run.end - run.start) * PX_PER_MIN
    const band: TimeBand = { start: run.start, end: run.end, collapsed, top, height }
    top += height
    return band
  })
}

/** Piecewise minutes → pixel offset; linear inside a band, compressed across collapsed ones. */
function timeToY(bands: TimeBand[], minutes: number): number {
  for (const band of bands) {
    if (minutes <= band.end) {
      const ratio = (minutes - band.start) / (band.end - band.start)
      return band.top + band.height * Math.min(Math.max(ratio, 0), 1)
    }
  }
  const last = bands.at(-1)
  return last ? last.top + last.height : BODY_PAD
}

type Group = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  maxStudents: number
  course: { title: string; level: string | null; kind: ProgramKind }
  location: { name: string }
  _count: { enrollments: number; preferredInquiries: number }
}

interface WeeklyScheduleProps {
  groups: Group[]
}

export function WeeklySchedule({ groups }: Readonly<WeeklyScheduleProps>) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  // Radionice live on a calendar date range, not a weekday —
  // they're shown on the /admin/skolska-godina calendar instead of this weekly grid.
  const withEffectiveDay = groups
    .filter((g) => !isRadionica(g.course.kind))
    .map((g) => ({
      ...g,
      effectiveDay: g.dayOfWeek ?? null,
    }))

  const allScheduled = withEffectiveDay.filter((g) => g.effectiveDay && g.startTime)

  if (allScheduled.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-6">
        Nema zakazanih grupa standardnih programa s određenim terminima.
      </div>
    )
  }

  const scheduled = allScheduled.filter((g) => matchesFilter(g, activeFilter))

  // Time range and band layout always based on all groups so the grid doesn't jump when filtering
  const allBounds = allScheduled.map((g) => {
    const start = parseTime(g.startTime!)
    return { start, end: g.endTime ? parseTime(g.endTime) : start + DEFAULT_DURATION }
  })
  const minTime = Math.floor(Math.min(...allBounds.map((b) => b.start)) / 60) * 60
  const maxTime = Math.ceil(Math.max(...allBounds.map((b) => b.end)) / 60) * 60

  const bands = buildTimeBands(allBounds, minTime, maxTime)
  const yOf = (minutes: number) => timeToY(bands, minutes)

  // Hour ticks only inside the bands that are drawn to scale
  const slots: number[] = []
  for (const band of bands) {
    if (band.collapsed) continue
    for (let t = band.start; t <= band.end; t += 60) {
      if (!slots.includes(t)) slots.push(t)
    }
  }

  const lastBand = bands.at(-1)
  const gridHeight = lastBand ? lastBand.top + lastBand.height + BODY_PAD : BODY_PAD * 2

  return (
    <div>
      {/* Legend / filter — outside scroll container */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map(({ key, label }) => {
          const color = filterColor(key)
          const isActive = activeFilter === key
          if (key === 'all') {
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={[
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                ].join(' ')}
              >
                {label}
              </button>
            )
          }
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                isActive ? color!.active : `${color!.inactive} hover:opacity-80`,
              ].join(' ')}
            >
              {!isActive && <span className={`w-2 h-2 rounded-full ${color!.dot}`} />}
              {label}
            </button>
          )
        })}
      </div>

      {/* Schedule grid — overflow-x-auto wraps header + body so they scroll together horizontally */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <div className="min-w-[600px]">
          {/* Header row — always visible above the scrollable body */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-lg">
            <div className="flex-shrink-0 w-10" style={{ height: HEADER_HEIGHT }} />
            <div
              className="flex-1 grid divide-x divide-gray-200"
              style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
            >
              {DAYS.map((day, dayIdx) => (
                <div
                  key={day}
                  className="text-center flex items-center justify-center"
                  style={{ height: HEADER_HEIGHT }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {DAY_SHORT[dayIdx]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Body — scrolls vertically independently */}
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            <div className="flex" style={{ height: gridHeight }}>
              {/* Time axis */}
              <div className="flex-shrink-0 w-10 relative bg-white" style={{ height: gridHeight }}>
                {slots.map((t) => (
                  <div
                    key={t}
                    className="absolute right-1 text-[10px] text-gray-600 -translate-y-1/2"
                    style={{ top: yOf(t) }}
                  >
                    {formatTime(t)}
                  </div>
                ))}
                {bands
                  .filter((b) => b.collapsed)
                  .map((b) => (
                    <div
                      key={b.start}
                      className="absolute right-1 text-[10px] leading-none text-gray-400 -translate-y-1/2"
                      style={{ top: b.top + b.height / 2 }}
                    >
                      ⋯
                    </div>
                  ))}
              </div>

              {/* Day columns */}
              <div className="flex-1 relative">
                <div className="absolute inset-0 pointer-events-none">
                  {bands
                    .filter((b) => b.collapsed)
                    .map((b) => (
                      <div
                        key={b.start}
                        className="absolute left-0 right-0 bg-gray-100 flex items-center justify-center"
                        style={{ top: b.top, height: b.height }}
                      >
                        <span className="text-[9px] text-gray-400">
                          {formatTime(b.start)}–{formatTime(b.end)}
                        </span>
                      </div>
                    ))}
                  {slots.map((t) => (
                    <div
                      key={t}
                      className="absolute left-0 right-0 border-t border-gray-300"
                      style={{ top: yOf(t) }}
                    />
                  ))}
                </div>

                <div
                  className="grid divide-x divide-gray-200"
                  style={{ gridTemplateColumns: 'repeat(7, 1fr)', height: gridHeight }}
                >
                  {DAYS.map((day) => {
                    const dayGroups = scheduled.filter((g) => g.effectiveDay === day)
                    const hasAny = allScheduled.some((g) => g.effectiveDay === day)

                    const dayGroupsWithBounds = dayGroups.map((g) => {
                      const start = parseTime(g.startTime!)
                      const end = g.endTime ? parseTime(g.endTime) : start + DEFAULT_DURATION
                      return { group: g, start, end }
                    })
                    const layouts = assignLanes(
                      dayGroupsWithBounds.map(({ start, end }) => ({
                        startMinutes: start,
                        endMinutes: end,
                      })),
                    )

                    return (
                      <div key={day} className={`relative ${hasAny ? '' : 'bg-gray-50/50'}`}>
                        {dayGroupsWithBounds.map(({ group: g, start, end }, idx) => {
                          const top = yOf(start)
                          const height = Math.max(yOf(end) - top - 2, 16)
                          const { laneIndex, laneCount } = layouts[idx]
                          const widthPct = 100 / laneCount
                          const leftPct = laneIndex * widthPct
                          const color = courseColor(g.course.level)
                          const label = g.name ?? g.course.title
                          const timeRange = g.endTime ? g.startTime + '–' + g.endTime : g.startTime
                          const titleText = [
                            label + ' – ' + g.location.name,
                            g.effectiveDay + ' ' + timeRange,
                            g._count.enrollments + '/' + g.maxStudents + ' polaznika · ' + g._count.preferredInquiries + ' upita',
                          ].join('\n')

                          return (
                            <div
                              key={g.id}
                              className={`absolute rounded border px-1 overflow-hidden ${color.bg} ${color.border}`}
                              style={{
                                top,
                                height,
                                left: `calc(${leftPct}% + 2px)`,
                                width: `calc(${widthPct}% - 4px)`,
                              }}
                              title={titleText}
                            >
                              <p className={`text-[10px] font-semibold leading-tight truncate ${color.text}`}>
                                {label}
                              </p>
                              {height > 28 && (
                                <p className={`text-[10px] leading-tight truncate opacity-70 ${color.text}`}>
                                  {timeRange}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
