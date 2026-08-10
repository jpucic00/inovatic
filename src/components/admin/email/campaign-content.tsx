'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'
import { getCampaignEmailHtml } from '@/actions/admin/email-campaign'
import { EmailPreviewDialog } from './email-preview-dialog'

/**
 * What the campaign actually said. The detail page used to show only the
 * subject and the per-recipient statuses, which answered "who got a mail" but
 * not "what did it say" — the body is stored on the campaign and was simply
 * never rendered.
 */
export function CampaignContent({
  campaignId,
  kind,
  subject,
  bodyText,
}: Readonly<{ campaignId: string; kind: string; subject: string; bodyText: string }>) {
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState<string | null>(null)

  const isEvaluation = kind === 'EVALUATION'

  function handlePreview() {
    setHtml(null)
    setOpen(true)
    getCampaignEmailHtml(campaignId)
      .then((res) => {
        if (res.success) {
          setHtml(res.html)
        } else {
          setOpen(false)
          toast.error(res.error)
        }
      })
      .catch(() => {
        setOpen(false)
        toast.error('Greška pri izradi pregleda.')
      })
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Sadržaj e-maila</h2>
          <p className="text-xs text-gray-500 mt-0.5">Predmet: {subject}</p>
        </div>
        <button
          type="button"
          onClick={handlePreview}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Eye className="w-4 h-4" />
          Pregledaj e-mail
        </button>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 border-t border-gray-100 pt-3">
        {bodyText}
      </p>

      {isEvaluation && (
        <p className="mt-3 text-xs text-gray-500">
          Pregled prikazuje poruku bez evaluacije — svaka je evaluacija vezana uz jedno dijete i
          otvara se iz tablice primatelja.
        </p>
      )}

      <EmailPreviewDialog
        open={open}
        onOpenChange={setOpen}
        html={html}
        description={
          isEvaluation
            ? 'Poruka bez evaluacijske kartice — kartica se otvara po primatelju.'
            : 'Ovako je poruka izgledala roditelju.'
        }
      />
    </section>
  )
}
