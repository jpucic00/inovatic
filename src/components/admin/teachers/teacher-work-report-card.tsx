import { CalendarClock } from 'lucide-react'
import { formatDateKey, formatHours, formatMonthYear } from '@/lib/format'
import type { TeacherWorkReport, WorkReportMonth } from '@/lib/teacher-work-report'

function MonthTotals({ month }: Readonly<{ month: WorkReportMonth }>) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {[
        { label: 'Sati', value: formatHours(month.totalMinutes) },
        { label: 'Termina', value: String(month.sessionCount) },
        { label: 'Grupa', value: String(month.groupCount) },
      ].map((stat) => (
        <div key={stat.label} className="rounded-lg border bg-white px-3 py-2">
          <p className="text-xs text-gray-500">{stat.label}</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{stat.value}</p>
        </div>
      ))}
    </div>
  )
}

function SessionChip({ date }: Readonly<{ date: string }>) {
  return (
    <span
      title="Termin na kojem je nastavnik evidentiran kao prisutan"
      className="inline-flex items-center rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs tabular-nums text-gray-600"
    >
      {formatDateKey(date).slice(0, 6)}
    </span>
  )
}

function MonthBlock({ month }: Readonly<{ month: WorkReportMonth }>) {
  const { window } = month
  return (
    <div className="rounded-xl border bg-gray-50 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        {formatMonthYear(window.year, window.month)}
      </h3>

      <MonthTotals month={month} />

      {month.groups.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nema evidentiranih termina.</p>
      ) : (
        <div className="space-y-2">
          {month.groups.map((g) => (
            <div key={g.groupId} className="rounded-lg border bg-white p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-gray-900">{g.label}</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">
                  {formatHours(g.totalMinutes)}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {g.sessionMinutes === null ? (
                  <span className="text-amber-700">
                    Grupa nema definirano vrijeme — sati se ne mogu izračunati
                  </span>
                ) : (
                  <>
                    {g.sessionCount} × {formatHours(g.sessionMinutes)}
                    {g.startTime && g.endTime && ` (${g.startTime}–${g.endTime})`}
                  </>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {g.sessions.map((date) => (
                  <SessionChip key={date} date={date} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Read-only payout basis: hours credited to this teacher in the current and
 * previous calendar month, derived from who last recorded each class session.
 */
export function TeacherWorkReportCard({
  report,
}: Readonly<{ report: TeacherWorkReport }>) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Evidencija rada</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Sati se broje iz evidencije nastavnika na terminu i trajanja grupe.
        Zapisi ostaju i nakon što nastavnik više nije dodijeljen grupi.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <MonthBlock month={report.current} />
        <MonthBlock month={report.previous} />
      </div>
    </div>
  )
}
