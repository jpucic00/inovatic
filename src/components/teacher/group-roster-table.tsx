import Link from 'next/link'
import type { RosterRow } from '@/actions/teacher/group'

function formatDob(iso: string | null): string {
  if (!iso) return '—'
  // childDateOfBirth is stored as "YYYY-MM-DD" string in the DB; render as
  // Croatian dd.MM.yyyy. Graceful fallback for any legacy non-ISO strings.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}.${m[2]}.${m[1]}.`
}

interface Props {
  rows: RosterRow[]
  /**
   * The group this roster belongs to, threaded onto every student link as
   * `?grupa=` so the student page can send the teacher back HERE instead of all
   * the way out to the groups list.
   */
  groupId: string
}

export function GroupRosterTable({ rows, groupId }: Readonly<Props>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-500">Nema upisanih polaznika u ovu grupu.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Polaznik</th>
            <th className="px-4 py-2.5 text-left font-medium">Datum rođenja</th>
            <th className="px-4 py-2.5 text-left font-medium">Škola</th>
            <th className="px-4 py-2.5 text-left font-medium">Roditelj</th>
            <th className="px-4 py-2.5 text-left font-medium">Kontakt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r) => {
            const fullName = `${r.firstName} ${r.lastName}`.trim()
            return (
              <tr key={r.enrollmentId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link
                    href={`/nastavnik/ucenik/${r.studentId}?grupa=${groupId}`}
                    className="text-cyan-700 hover:underline"
                  >
                    {fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                  {formatDob(r.dateOfBirth)}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {r.childSchool ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {r.parentName ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div className="flex flex-col gap-0.5">
                    {r.parentEmail ? (
                      <a
                        href={`mailto:${r.parentEmail}`}
                        className="text-cyan-700 hover:underline"
                      >
                        {r.parentEmail}
                      </a>
                    ) : null}
                    {r.parentPhone ? (
                      <a
                        href={`tel:${r.parentPhone.replaceAll(/\s+/g, '')}`}
                        className="text-cyan-700 hover:underline"
                      >
                        {r.parentPhone}
                      </a>
                    ) : null}
                    {!r.parentEmail && !r.parentPhone ? (
                      <span className="text-gray-400">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
