import { formatDate } from '@/lib/format'
import { fromDateKey } from '@/lib/session-dates'
import type { StudentAttendanceEnrollment } from '@/actions/admin/attendance'

interface Props {
  enrollments: StudentAttendanceEnrollment[]
}

export function AttendancePanel({ enrollments }: Readonly<Props>) {
  const anyRecorded = enrollments.some((e) => e.rows.length > 0)
  if (!anyRecorded) {
    return (
      <p className="text-sm text-gray-400 italic">
        Za ovog učenika još nema zabilježene evidencije dolaska.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {enrollments.map((e) => {
        const total = e.rows.length
        return (
          <div key={e.enrollmentId} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {e.courseTitle}
                  {e.groupName ? (
                    <span className="text-gray-500"> — {e.groupName}</span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Školska godina {e.schoolYear}.</p>
              </div>
              <div className="flex gap-1.5 shrink-0 text-[11px] font-medium">
                <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                  {e.presentCount} prisutan
                </span>
                <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5">
                  {e.absentCount} odsutan
                </span>
                <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">
                  {total} ukupno
                </span>
              </div>
            </div>

            {total === 0 ? (
              <p className="text-xs text-gray-400 italic">Nema zapisa.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Datum</th>
                      <th className="px-3 py-1.5 text-left font-medium">Status</th>
                      <th className="px-3 py-1.5 text-left font-medium">Bilješka</th>
                      <th className="px-3 py-1.5 text-left font-medium">Zapisao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {e.rows.map((r) => (
                      <tr key={r.sessionDate}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-gray-800">
                          {formatDate(fromDateKey(r.sessionDate))}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={[
                              'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                              r.present
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700',
                            ].join(' ')}
                          >
                            {r.present ? 'Prisutan' : 'Odsutan'}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-700">
                          {r.note ?? <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {r.recordedBy ? (
                            <span className="inline-flex items-center gap-1.5">
                              {r.recordedBy}
                              {r.recordedByDeleted ? (
                                <span className="rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                                  Bivši nastavnik
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
