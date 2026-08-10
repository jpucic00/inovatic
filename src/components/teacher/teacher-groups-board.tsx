'use client'

import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import type { TeacherGroupSummary } from '@/actions/teacher/dashboard'
import { formatGroupSchedule } from '@/lib/format'
import { GroupCard, groupByCourse } from '@/components/shared/group-card'
import { isRadionica } from '@/lib/program-kind'

interface Props {
  groups: TeacherGroupSummary[]
  /** Tab the board opens on — always the computed current school year. */
  currentYear: string
}

/**
 * "Moje grupe" with one tab per school year. Every year is already loaded by
 * the page, so switching filters client-side — no refetch.
 *
 * The selection is deliberately state-only: no cookie, no sessionStorage, no
 * query param. A teacher opening the panel is virtually always looking at the
 * year they are teaching, so the current year has to win on every visit; past
 * years are a lookup, not a place to be left parked.
 */
export function TeacherGroupsBoard({ groups, currentYear }: Readonly<Props>) {
  // The current year is a tab even with no groups yet — its empty state is the
  // honest answer for a teacher whose new-year assignments aren't made.
  const years = useMemo(() => {
    const set = new Set<string>([currentYear])
    for (const g of groups) set.add(g.schoolYear)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [groups, currentYear])

  const [activeYear, setActiveYear] = useState(currentYear)

  const yearGroups = groups.filter((g) => g.schoolYear === activeYear)

  return (
    <div>
      {/* Rendered even for a single year — it replaces the page subtitle that
          used to name the year, so the list is never year-ambiguous. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-500">Školska godina:</span>
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 rounded-lg border-0 bg-gray-100 p-1">
          <legend className="sr-only">Odabir školske godine</legend>
          {years.map((y) => {
            const isActive = y === activeYear
            return (
              <button
                key={y}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveYear(y)}
                className={[
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                ].join(' ')}
              >
                {y}
              </button>
            )
          })}
        </fieldset>
      </div>

      {yearGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-500">
            Nemate dodijeljenih grupa za školsku godinu {activeYear}.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupByCourse(yearGroups, (g) => g.course).map((section) => (
            <section key={section.courseId}>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.courseTitle}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map((g) => (
                  <GroupCard
                    key={g.id}
                    href={`/nastavnik/grupa/${g.id}`}
                    name={g.name}
                    schedule={formatGroupSchedule({
                      dateRange: isRadionica(g.course.kind),
                      dayOfWeek: g.dayOfWeek,
                      startTime: g.startTime,
                      endTime: g.endTime,
                    })}
                    locationName={g.location.name}
                    extraRows={
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" />
                        {g.enrollmentCount} {g.enrollmentCount === 1 ? 'polaznik' : 'polaznika'}
                      </div>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
