'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck, FilePlus } from 'lucide-react'
import { toast } from 'sonner'
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
   * The admin or teacher variant, chosen by the page that renders the profile —
   * the same prop-injection the comment and assessment actions already use, so
   * the shared view never imports a role-specific action itself.
   */
  onSetContractSigned: SetContractSignedAction
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
  onSetContractSigned,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const signed = contractSignedAt !== null

  const toggle = () => {
    const next = !signed
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

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Ugovor</p>
      <div className="flex flex-wrap items-center gap-2">
        {signed ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700">
              <FileCheck className="w-3 h-3" />
              Ugovor potpisan · {formatDate(contractSignedAt)}
            </span>
            <button
              type="button"
              onClick={toggle}
              disabled={isPending}
              className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              {isPending ? '...' : 'Poništi'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggle}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 disabled:opacity-50"
          >
            {isPending ? <span className="text-[10px]">...</span> : <FilePlus className="w-3 h-3" />}
            Označi ugovor potpisanim
          </button>
        )}
      </div>
    </div>
  )
}
