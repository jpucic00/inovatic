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
import { deleteTeacher } from '@/actions/admin/teacher'
import { toast } from 'sonner'

interface Props {
  teacherId: string
  teacherName: string
  assignmentCount: number
}

export function DeleteTeacherDialog({
  teacherId,
  teacherName,
  assignmentCount,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteTeacher(teacherId)
      if (res.success) {
        toast.success('Nastavnik obrisan.')
        router.push('/admin/nastavnici')
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
          <Trash2 className="w-4 h-4" />
          Obriši nastavnika
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trajno obrisati nastavnika?</DialogTitle>
          <DialogDescription>
            Trajno će biti obrisan račun <strong>{teacherName}</strong>
            {assignmentCount > 0 && (
              <>
                {' '}
                i njegove dodjele ({assignmentCount}{' '}
                {assignmentCount === 1 ? 'grupa' : 'grupa'}).
              </>
            )}{' '}
            Ovo se ne može poništiti.
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
