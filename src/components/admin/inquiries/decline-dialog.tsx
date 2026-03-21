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
import { updateInquiryStatus } from '@/actions/admin/inquiry'
import { toast } from 'sonner'

interface DeclineDialogProps {
  inquiryId: string
  childName: string
}

export function DeclineDialog({ inquiryId, childName }: Readonly<DeclineDialogProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDecline = () => {
    startTransition(async () => {
      const result = await updateInquiryStatus(inquiryId, 'DECLINED')
      if (result.success) {
        toast.success('Upit označen kao odbijen.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri ažuriranju.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <DialogFooter>
          <button
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={handleDecline}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Obrađujem...' : 'Odbij upit'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
