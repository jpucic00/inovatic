import Link from 'next/link'
import { formatDate } from '@/lib/format'
import type { getEmailCampaigns } from '@/actions/admin/email-campaign'

type Campaigns = Awaited<ReturnType<typeof getEmailCampaigns>>

const KIND_BADGE: Record<Campaigns[number]['kind'], { label: string; className: string }> = {
  CUSTOM: { label: 'Prilagođena', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  REENROLLMENT: { label: 'Pozivnica za upis', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
}

export function CampaignHistory({ campaigns }: Readonly<{ campaigns: Campaigns }>) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Povijest slanja</h2>
      {campaigns.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Još nema poslanih kampanja.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Vrsta</th>
                <th className="px-4 py-3 font-medium">Predmet</th>
                <th className="px-4 py-3 font-medium">Primatelji</th>
                <th className="px-4 py-3 font-medium text-right">Poslano</th>
                <th className="px-4 py-3 font-medium text-right">Neuspješno</th>
                <th className="px-4 py-3 font-medium">Poslao/la</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const badge = KIND_BADGE[c.kind]
                const groupCount = c.sourceGroupIds.length
                const groupNoun = groupCount === 1 ? 'grupa' : 'grupe'
                const cohort =
                  groupCount > 0
                    ? `${groupCount} ${groupNoun}`
                    : `preporuka: ${c.sourceRecommendations.join(', ')}`
                return (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-medium rounded px-1.5 py-0.5 border ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[18rem] truncate" title={c.subject}>
                      <Link
                        href={`/admin/email/${c.id}`}
                        className="text-cyan-700 hover:text-cyan-800 hover:underline"
                      >
                        {c.subject}
                      </Link>
                      {c.finishedAt === null && (
                        <span className="ml-2 rounded-full bg-cyan-100 text-cyan-700 px-1.5 py-0.5 text-[10px] font-medium">
                          slanje u tijeku
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap max-w-[16rem] truncate text-gray-600"
                      title={`${c.sourceSchoolYear} · ${cohort}`}
                    >
                      {c.sourceSchoolYear} · {cohort}
                      {c.kind === 'REENROLLMENT' && c.targetCourse && (
                        <span className="text-gray-400"> → {c.targetCourse.title}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{c.sentCount}</td>
                    <td
                      className={`px-4 py-3 text-right ${c.failedCount > 0 ? 'font-medium text-red-600' : 'text-gray-400'}`}
                    >
                      {c.failedCount > 0 ? c.failedCount : '–'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {c.sentBy.firstName} {c.sentBy.lastName}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
