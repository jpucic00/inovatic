'use client'

import { useState } from 'react'

const DAYS = ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja']
const DAY_SHORT = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned']

const PX_PER_MIN = 0.9
const HEADER_HEIGHT = 26
const DEFAULT_DURATION = 90
const BODY_PAD = 10

type FilterKey = 'all' | 'SLR_1' | 'SLR_2' | 'SLR_3' | 'SLR_4' | 'radionice'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Sve grupe' },
  { key: 'SLR_1', label: 'SLR 1' },
  { key: 'SLR_2', label: 'SLR 2' },
  { key: 'SLR_3', label: 'SLR 3' },
  { key: 'SLR_4', label: 'SLR 4' },
  { key: 'radionice', label: 'Radionice' },
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

function courseColor(level: string | null, isCustom: boolean) {
  if (isCustom) return { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800', dot: 'bg-rose-400', active: 'bg-rose-500 text-white', inactive: 'bg-rose-50 text-rose-600 border border-rose-200' }
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
    case 'SLR_1': return courseColor('SLR_1', false)
    case 'SLR_2': return courseColor('SLR_2', false)
    case 'SLR_3': return courseColor('SLR_3', false)
    case 'SLR_4': return courseColor('SLR_4', false)
    case 'radionice': return courseColor(null, true)
    default: return null
  }
}

function matchesFilter(g: { course: { level: string | null; isCustom: boolean } }, filter: FilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'radionice') return g.course.isCustom
  return g.course.level === filter && !g.course.isCustom
}

const DATE_TO_DAY: Record<number, string> = {
  0: 'Nedjelja', 1: 'Ponedjeljak', 2: 'Utorak', 3: 'Srijeda',
  4: 'Četvrtak', 5: 'Petak', 6: 'Subota',
}

function dateToDay(dateStr: string): string {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0] ?? 0
  const m = parts[1] ?? 0
  const d = parts[2] ?? 0
  return DATE_TO_DAY[new Date(y, m - 1, d).getDay()] ?? ''
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}.`
}

type Group = {
  id: string
  name: string | null
  date: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  maxStudents: number
  course: { title: string; level: string | null; isCustom: boolean }
  location: { name: string }
  _count: { enrollments: number; preferredInquiries: number }
}

interface WeeklyScheduleProps {
  groups: Group[]
}

export function WeeklySchedule({ groups }: Readonly<WeeklyScheduleProps>) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  // For radionice, derive effective day from the date field
  const withEffectiveDay = groups.map((g) => ({
    ...g,
    effectiveDay: g.course.isCustom && g.date ? dateToDay(g.date) : (g.dayOfWeek ?? null),
  }))

  const allScheduled = withEffectiveDay.filter((g) => g.effectiveDay && g.startTime)

  if (allScheduled.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-6">
        Nema zakazanih grupa s određenim terminima.
      </div>
    )
  }

  const scheduled = allScheduled.filter((g) => matchesFilter(g, activeFilter))

  // Time range always based on all groups so the grid doesn't jump when filtering
  const allStarts = allScheduled.map((g) => parseTime(g.startTime!))
  const allEnds = allScheduled.map((g) =>
    g.endTime ? parseTime(g.endTime) : parseTime(g.startTime!) + DEFAULT_DURATION,
  )
  const minTime = Math.floor(Math.min(...allStarts) / 60) * 60
  const maxTime = Math.ceil(Math.max(...allEnds) / 60) * 60
  const totalMinutes = maxTime - minTime

  const slots: number[] = []
  for (let t = minTime; t <= maxTime; t += 60) slots.push(t)

  const gridHeight = totalMinutes * PX_PER_MIN + BODY_PAD * 2

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
                    style={{ top: (t - minTime) * PX_PER_MIN + BODY_PAD }}
                  >
                    {formatTime(t)}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div className="flex-1 relative">
                <div className="absolute inset-0 pointer-events-none">
                  {slots.map((t) => (
                    <div
                      key={t}
                      className="absolute left-0 right-0 border-t border-gray-300"
                      style={{ top: (t - minTime) * PX_PER_MIN + BODY_PAD }}
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

                    return (
                      <div key={day} className={`relative ${hasAny ? '' : 'bg-gray-50/50'}`}>
                        {dayGroups.map((g) => {
                          const start = parseTime(g.startTime!)
                          const end = g.endTime ? parseTime(g.endTime) : start + DEFAULT_DURATION
                          const top = (start - minTime) * PX_PER_MIN + BODY_PAD
                          const height = Math.max((end - start) * PX_PER_MIN - 2, 16)
                          const color = courseColor(g.course.level, g.course.isCustom)
                          const label = g.name ?? g.course.title
                          const dateLabel = g.course.isCustom && g.date ? formatDate(g.date) : null
                          const timeRange = g.endTime ? g.startTime + '–' + g.endTime : g.startTime
                          const titleText = [
                            label + ' – ' + g.location.name,
                            (dateLabel ?? g.effectiveDay) + ' ' + timeRange,
                            g._count.enrollments + '/' + g.maxStudents + ' polaznika · ' + g._count.preferredInquiries + ' upita',
                          ].join('\n')

                          return (
                            <div
                              key={g.id}
                              className={`absolute left-0.5 right-0.5 rounded border px-1 overflow-hidden ${color.bg} ${color.border}`}
                              style={{ top, height }}
                              title={titleText}
                            >
                              <p className={`text-[10px] font-semibold leading-tight truncate ${color.text}`}>
                                {label}
                              </p>
                              {height > 28 && (
                                <p className={`text-[10px] leading-tight truncate opacity-70 ${color.text}`}>
                                  {dateLabel ?? timeRange}
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
