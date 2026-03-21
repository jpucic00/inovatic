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
import { Trash2 } from 'lucide-react'
import { deleteInquiry } from '@/actions/admin/inquiry'
import { toast } from 'sonner'

interface DeleteDialogProps {
  inquiryId: string
  childName: string
}

export function DeleteDialog({ inquiryId, childName }: Readonly<DeleteDialogProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteInquiry(inquiryId)
      if (result.success) {
        toast.success('Upit je trajno obrisan.')
        setOpen(false)
        router.push('/admin/upiti')
      } else {
        toast.error(result.error ?? 'Greška pri brisanju.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          <Trash2 className="w-4 h-4" />
          Obriši (GDPR)
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trajno obrisati upit?</DialogTitle>
          <DialogDescription>
            Ova radnja je <strong>nepovratna</strong>. Sve osobne podatke o roditelju i djetetu{' '}
            <strong>{childName}</strong> bit će trajno obrisani u skladu s pravom na brisanje
            (GDPR čl. 17).
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
            onClick={handleDelete}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Brišem...' : 'Trajno obriši'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
