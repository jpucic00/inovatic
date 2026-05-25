import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import type { WeekdaySummary } from '@/lib/group-end-dates'

type Props = {
  summary: WeekdaySummary[]
}

export function WeekdayEndSummary({ summary }: Readonly<Props>) {
  // Pivot: rows = courses (taken from the first non-empty weekday), columns = weekdays.
  const firstWithCourses = summary.find((w) => w.courses.length > 0)
  if (!firstWithCourses) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Završeci grupa po danima</h2>
        Nema standardnih programa s rasporedom modula u ovoj školskoj godini.
      </section>
    )
  }

  const courses = firstWithCourses.courses.map((c) => ({
    id: c.courseId,
    title: c.courseTitle,
    level: c.level,
  }))

  // Build lookup: courseId × weekday → cell
  const byCourseAndDay = new Map<string, Map<string, WeekdaySummary['courses'][number]>>()
  for (const w of summary) {
    for (const c of w.courses) {
      let inner = byCourseAndDay.get(c.courseId)
      if (!inner) {
        inner = new Map()
        byCourseAndDay.set(c.courseId, inner)
      }
      inner.set(w.weekday, c)
    }
  }

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-base font-semibold text-gray-900">Završeci grupa po danima</h2>
        <p className="text-sm text-gray-600">
          Stvaran broj radionica i datum zadnje radionice po danu u tjednu, uzimajući u obzir
          praznike. Amber znači da grupa neće ostvariti cilj od 28 radionica unutar trajanja
          modula — produžite kraj zadnjeg modula u programu.
        </p>
      </header>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gray-700">Program</th>
              {summary.map((w) => (
                <th key={w.weekday} className="px-3 py-2 text-left font-medium text-gray-700">
                  {w.weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2 align-top font-medium text-gray-900">
                  <span className="block">{c.title}</span>
                  {c.level && (
                    <span className="text-[11px] uppercase tracking-wider text-gray-500">
                      {c.level.replace('_', ' ')}
                    </span>
                  )}
                </td>
                {summary.map((w) => {
                  const cell = byCourseAndDay.get(c.id)?.get(w.weekday)
                  if (!cell) {
                    return (
                      <td key={w.weekday} className="px-3 py-2 text-gray-400">
                        —
                      </td>
                    )
                  }
                  const ok = !cell.shortOfTarget && !cell.overflowsWindow
                  const reason = cell.overflowsWindow
                    ? 'Zadnja radionica je nakon kraja zadnjeg modula.'
                    : cell.shortOfTarget
                      ? `Manjak ${cell.target - cell.computedSessions} ${
                          cell.target - cell.computedSessions === 1 ? 'radionice' : 'radionica'
                        }.`
                      : 'Cilj ostvaren unutar trajanja modula.'
                  return (
                    <td
                      key={w.weekday}
                      className={cn(
                        'px-3 py-2 align-top',
                        ok ? 'text-emerald-800' : 'text-amber-800',
                      )}
                      title={reason}
                    >
                      <span
                        className={cn(
                          'inline-flex flex-col rounded-md px-2 py-1 text-xs',
                          ok ? 'bg-emerald-50' : 'bg-amber-50',
                        )}
                      >
                        <strong>
                          {cell.computedSessions}/{cell.target}
                        </strong>
                        <span>
                          zadnja{' '}
                          {cell.lastSessionDate ? formatDate(cell.lastSessionDate) : '—'}
                        </span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
