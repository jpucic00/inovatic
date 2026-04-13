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
import { deleteStudent } from '@/actions/admin/student'
import { toast } from 'sonner'

interface DeleteStudentDialogProps {
  studentId: string
  studentName: string
}

export function DeleteStudentDialog({
  studentId,
  studentName,
}: Readonly<DeleteStudentDialogProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteStudent(studentId)
      if (result.success) {
        toast.success('Učenik obrisan.')
        router.push('/admin/ucenici')
      } else {
        toast.error(result.error ?? 'Greška pri brisanju.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
          <Trash2 className="w-4 h-4" />
          Obriši učenika (GDPR)
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trajno obrisati učenika?</DialogTitle>
          <DialogDescription>
            Ova radnja će trajno obrisati račun učenika{' '}
            <strong>{studentName}</strong>, sve upise, bilješke i povezane
            podatke. Ovo se ne može poništiti (GDPR čl. 17).
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
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Brišem...' : 'Obriši trajno'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
