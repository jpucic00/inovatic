'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  getCampaignProgress,
  resumeEmailCampaign,
  type CampaignDetail,
} from '@/actions/admin/email-campaign'
import { formatDate } from '@/lib/format'

const STATUS_LABEL: Record<string, string> = {
  SENT: 'Poslano',
  FAILED: 'Neuspješno',
  // Covers both skip causes — the per-row `failureReason` says which one, and on
  // an evaluation campaign it is as often "nema evaluaciju" as a missing address.
  SKIPPED: 'Preskočeno',
  ALREADY_SENT: 'Već pozvan ranije',
  PENDING: 'Na čekanju',
}

const STATUS_CLASS: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-amber-100 text-amber-800',
  ALREADY_SENT: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-cyan-100 text-cyan-700',
}

/** Problems first — this page exists to find who was missed. */
const STATUS_ORDER = ['FAILED', 'SKIPPED', 'PENDING', 'ALREADY_SENT', 'SENT']

export function CampaignRecipients({ campaign }: Readonly<{ campaign: CampaignDetail }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [finished, setFinished] = useState(campaign.finished)

  // While a send is in flight the rows change under us, so refresh the page
  // data until the campaign closes out.
  useEffect(() => {
    if (finished) return
    const timer = setInterval(async () => {
      try {
        const p = await getCampaignProgress(campaign.id)
        router.refresh()
        if (p.finished) setFinished(true)
      } catch {
        // Transient — the next tick retries.
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [campaign.id, finished, router])

  const rows = [...campaign.recipients].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.parentEmail.localeCompare(b.parentEmail, 'hr'),
  )
  const pendingCount = rows.filter((r) => r.status === 'PENDING').length

  function handleResume() {
    startTransition(async () => {
      const res = await resumeEmailCampaign(campaign.id)
      if (res.success) {
        setFinished(false)
        toast.success(
          res.remaining === 0 ? 'Nema preostalih primatelja.' : `Nastavljam — ${res.remaining} preostalo.`,
        )
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Stat label="Poslano" value={campaign.sentCount} tone="text-emerald-700" />
            <Stat label="Neuspješno" value={campaign.failedCount} tone="text-red-700" />
            <Stat label="Preskočeno" value={campaign.skippedCount} tone="text-amber-800" />
            <Stat label="Isključeno" value={campaign.excludedCount} tone="text-gray-600" />
            <Stat label="Ukupno za slanje" value={campaign.totalCount} tone="text-gray-900" />
          </dl>

          {!finished && (
            <span className="inline-flex items-center gap-1.5 text-xs text-cyan-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Slanje u tijeku…
            </span>
          )}
          {finished && pendingCount > 0 && (
            <button
              type="button"
              onClick={handleResume}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
              Nastavi slanje ({pendingCount})
            </button>
          )}
        </div>

        {finished && pendingCount > 0 && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Slanje je prekinuto prije kraja (npr. novi deploy). Nastavak šalje samo preostalim
            roditeljima — nitko tko je već primio poruku neće je dobiti ponovno.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Polaznik</th>
                <th className="px-4 py-2.5 text-left font-medium">E-mail roditelja</th>
                <th className="px-4 py-2.5 text-left font-medium w-40">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Napomena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    Nema primatelja.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.childNames.length > 0 ? r.childNames.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {r.parentEmail || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        STATUS_CLASS[r.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {r.failureReason ?? (r.status === 'SENT' ? formatDate(new Date(r.sentAt)) : '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: Readonly<{ label: string; value: number; tone: string }>) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`font-semibold ${tone}`}>{value}</dd>
    </div>
  )
}
