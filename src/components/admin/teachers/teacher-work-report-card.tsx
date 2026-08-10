import { CalendarClock, ChevronRight, TriangleAlert } from 'lucide-react'
import {
  croatianPlural,
  formatDateKey,
  formatEurCents,
  formatHours,
  formatMonthYear,
} from '@/lib/format'
import type { TeacherWorkReport, WorkReportMonth } from '@/lib/teacher-work-report'
import { TeacherHourlyRateDialog } from './teacher-hourly-rate-dialog'

/** Euro cents, or an em dash when no rate is set — never a misleading 0 €. */
function amountLabel(cents: number | null): string {
  return cents === null ? '—' : formatEurCents(cents)
}

function terminLabel(count: number): string {
  return `${count} ${croatianPlural(count, 'termin', 'termina', 'termina')}`
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

function MonthBody({ month }: Readonly<{ month: WorkReportMonth }>) {
  if (month.groups.length === 0) {
    return (
      <p className="px-4 pb-4 text-sm text-gray-400 italic">Nema evidentiranih termina.</p>
    )
  }

  return (
    <div className="space-y-2 px-4 pb-4">
      {month.groups.map((g) => (
        <div key={g.groupId} className="rounded-lg border bg-white p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-gray-900">{g.label}</p>
            <p className="text-sm tabular-nums shrink-0 text-gray-500">
              {formatHours(g.totalMinutes)}
              <span className="ml-2 font-semibold text-gray-900">
                {amountLabel(g.amountCents)}
              </span>
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
  )
}

/**
 * One collapsible month. Native `<details>` rather than client state — the card
 * stays a server component, and a year of session chips costs nothing until a
 * month is opened.
 */
function MonthBlock({
  month,
  defaultOpen,
}: Readonly<{ month: WorkReportMonth; defaultOpen: boolean }>) {
  const { window } = month
  return (
    <details open={defaultOpen} className="group rounded-xl border bg-gray-50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight className="w-4 h-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
          <span className="truncate text-sm font-semibold text-gray-700">
            {formatMonthYear(window.year, window.month)}
          </span>
          {month.hasUnpricedSessions && (
            <TriangleAlert
              className="w-3.5 h-3.5 shrink-0 text-amber-600"
              aria-label="Dio termina nema definirano trajanje pa nije uračunat"
            />
          )}
        </span>
        <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
          <span className="hidden text-xs text-gray-500 sm:inline">
            {terminLabel(month.sessionCount)}
          </span>
          <span className="text-sm text-gray-600">{formatHours(month.totalMinutes)}</span>
          <span className="w-20 text-right text-sm font-bold text-gray-900">
            {amountLabel(month.amountCents)}
          </span>
        </span>
      </summary>
      <MonthBody month={month} />
    </details>
  )
}

/**
 * Read-only payout basis: hours credited to this teacher over the last
 * `REPORT_MONTH_COUNT` calendar months, derived from their present
 * TeacherAttendance rows and the group's session length — never from who
 * recorded the students — priced at the teacher's current hourly rate.
 */
export function TeacherWorkReportCard({
  report,
  teacherId,
}: Readonly<{ report: TeacherWorkReport; teacherId: string }>) {
  const { rateCents } = report

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Evidencija rada</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Satnica:{' '}
            {rateCents === null ? (
              <span className="italic text-gray-400">nije postavljena</span>
            ) : (
              <span className="font-semibold text-gray-900 tabular-nums">
                {formatEurCents(rateCents)}/h
              </span>
            )}
          </span>
          <TeacherHourlyRateDialog teacherId={teacherId} rateCents={rateCents} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Sati se broje iz evidencije nastavnika na terminu i trajanja grupe. Zapisi
        ostaju i nakon što nastavnik više nije dodijeljen grupi.{' '}
        {rateCents === null
          ? 'Postavite satnicu da se izračuna iznos za isplatu.'
          : 'Svi iznosi računaju se po trenutnoj satnici, uključujući ranije mjesece.'}
      </p>

      <div className="space-y-2">
        {report.months.map((month, index) => (
          <MonthBlock
            key={month.window.startKey}
            month={month}
            defaultOpen={index === 0}
          />
        ))}
      </div>
    </div>
  )
}
