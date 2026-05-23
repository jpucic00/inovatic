'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { XCircle } from 'lucide-react'
import { declineInquiry } from '@/actions/admin/inquiry'
import { toast } from 'sonner'

interface DeclineDialogProps {
  inquiryId: string
  childName: string
}

const MIN_REASON_LENGTH = 3
const MAX_REASON_LENGTH = 2000

export function DeclineDialog({ inquiryId, childName }: Readonly<DeclineDialogProps>) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const trimmedLength = reason.trim().length
  const canSubmit = trimmedLength >= MIN_REASON_LENGTH && !isPending

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    setOpen(next)
    if (!next) setReason('')
  }

  const handleDecline = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await declineInquiry(inquiryId, reason)
      if (result.success) {
        toast.success('Upit označen kao odbijen.')
        setOpen(false)
        setReason('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri ažuriranju.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
          <XCircle className="w-4 h-4" />
          Odbij upit
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Odbiti upit?</DialogTitle>
          <DialogDescription>
            Označit ćete upit za <strong>{childName}</strong> kao odbijen. Roditelju neće biti
            automatski poslan obavijest — to je potrebno napraviti ručno.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="decline-reason" className="block text-sm font-medium text-gray-700">
            Razlog odbijanja <span className="text-red-600">*</span>
          </label>
          <textarea
            id="decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON_LENGTH}
            rows={4}
            disabled={isPending}
            placeholder="Zašto odbijate ovaj upit? Roditelj ovu poruku neće vidjeti — služi za vašu evidenciju."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 text-right">
            {trimmedLength}/{MAX_REASON_LENGTH}
          </p>
        </div>
        <DialogFooter>
          <button
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={handleDecline}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Obrađujem...' : 'Odbij upit'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
