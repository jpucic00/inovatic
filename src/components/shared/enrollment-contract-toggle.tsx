'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck, FilePlus } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmRequest } from '@/components/shared/confirm-dialog'
import type { AdminActionResult } from '@/lib/action-types'
import { formatDate } from '@/lib/format'

type SetContractSignedAction = (
  enrollmentId: string,
  signed: boolean,
) => Promise<AdminActionResult>

interface Props {
  enrollmentId: string
  contractSignedAt: Date | null
  /**
   * Course + group of the enrollment this mark belongs to, for the confirmation
   * dialog. A child can sit in several groups in one school year, each with its
   * own contract row, and the modal covers the card that was clicked.
   */
  groupLabel?: string
  /**
   * The admin or teacher variant, chosen by the page that renders the profile —
   * the same prop-injection the comment and assessment actions already use, so
   * the shared view never imports a role-specific action itself.
   */
  onSetContractSigned: SetContractSignedAction
  /**
   * Show the state without offering to change it.
   *
   * A teacher's student profile lists ALL of a child's enrollments — the roster
   * only has to share ONE group for the profile to open — so it routinely shows
   * groups a colleague teaches and years that are already settled. Rendering a
   * live button there was worse than useless: the action refuses through
   * `assertTeacherOwnsGroup`, which THROWS `notFound()`, so the click replaced
   * the whole profile with a 404 instead of reaching the toast below. The server
   * is still the gate; this only stops offering what it will refuse.
   */
  readOnly?: boolean
}

/**
 * "Ugovor potpisan" for one enrollment.
 *
 * Separate from `<EnrollmentPaymentPanel>` on purpose: that panel is admin-only
 * (the teacher payload scrubs every paid mark), while this is visible and
 * settable by a teacher for their own groups. Signing and paying are also two
 * different facts — a family can sign and pay later — so they read as two rows
 * rather than one combined status.
 */
export function EnrollmentContractToggle({
  enrollmentId,
  contractSignedAt,
  groupLabel,
  onSetContractSigned,
  readOnly = false,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)

  const signed = contractSignedAt !== null

  const run = (next: boolean) => {
    startTransition(async () => {
      const res = await onSetContractSigned(enrollmentId, next)
      if (res.success) {
        toast.success(next ? 'Ugovor označen kao potpisan.' : 'Oznaka ugovora uklonjena.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri spremanju ugovora.')
      }
    })
  }

  /**
   * Both directions are confirmed, not just the undo. The button sits in the
   * same dense stack as the paid chips, one row above them, so marking the
   * wrong child's contract signed is exactly as easy as un-marking the right
   * one — and the only trace either way is a toast that fades.
   */
  const askToToggle = () => {
    const next = !signed
    setConfirmRequest({
      title: next ? 'Označiti ugovor potpisanim?' : 'Ukloniti oznaku ugovora?',
      description: next
        ? 'Ugovor za ovaj upis bit će označen kao potpisan, s današnjim datumom.'
        : 'Datum potpisa bit će obrisan i upis se ponovno vodi bez potpisanog ugovora.',
      context: groupLabel,
      confirmLabel: next ? 'Označi potpisanim' : 'Ukloni oznaku',
      destructive: !next,
      onConfirm: () => run(next),
    })
  }

  // The signed badge is identical in both modes, so it is written once.
  const badge = (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700">
      <FileCheck className="w-3 h-3" />
      Ugovor potpisan · {formatDate(contractSignedAt)}
    </span>
  )

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Ugovor</p>
      <div className="flex flex-wrap items-center gap-2">
        {renderBody()}
      </div>
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </div>
  )

  function renderBody() {
    // Read-only: the same badge with no controls, and an explicit em dash
    // rather than an empty row, so "not signed" is never read as missing data.
    if (readOnly) return signed ? badge : <span className="text-xs text-gray-400">—</span>

    if (signed) {
      return (
        <>
          {badge}
          <button
            type="button"
            onClick={askToToggle}
            disabled={isPending}
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            {isPending ? '...' : 'Poništi'}
          </button>
        </>
      )
    }

    return (
      <button
        type="button"
        onClick={askToToggle}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 disabled:opacity-50"
      >
        {isPending ? <span className="text-[10px]">...</span> : <FilePlus className="w-3 h-3" />}
        Označi ugovor potpisanim
      </button>
    )
  }
}
