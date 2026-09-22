'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { removeInquiryFromWaitlist } from '@/actions/admin/inquiry'
import { ConfirmDialog, type ConfirmRequest } from '@/components/shared/confirm-dialog'

interface Props {
  inquiryId: string
  childName: string
}

export function RemoveFromWaitlistButton({ inquiryId, childName }: Readonly<Props>) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const remove = () =>
    startTransition(async () => {
      const result = await removeInquiryFromWaitlist(inquiryId)
      if (result.success) {
        toast.success('Upit je maknut s liste čekanja.')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          setRequest({
            title: 'Maknuti s liste čekanja?',
            description: (
              <>
                Upit za <strong>{childName}</strong> više neće biti na listi čekanja, a obitelj
                gubi svoje mjesto u redu. Status upita se ne mijenja.
              </>
            ),
            confirmLabel: 'Makni s liste',
            destructive: true,
            onConfirm: remove,
          })
        }
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Uklanjam...' : 'Makni s liste čekanja'}
      </button>
      <ConfirmDialog request={request} onClose={() => setRequest(null)} />
    </>
  )
}
