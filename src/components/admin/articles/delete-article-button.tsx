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
import { deleteArticle } from '@/actions/admin/article'
import { toast } from 'sonner'

interface Props {
  articleId: string
  articleTitle: string
  redirectOnDelete?: boolean
}

export function DeleteArticleButton({
  articleId,
  articleTitle,
  redirectOnDelete = false,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteArticle(articleId)
      if (res.success) {
        toast.success('Članak obrisan.')
        if (redirectOnDelete) {
          router.push('/admin/novosti')
        } else {
          router.refresh()
        }
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Obriši
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trajno obrisati članak?</DialogTitle>
          <DialogDescription>
            Trajno će biti obrisan članak <strong>{articleTitle}</strong>,
            uključujući sve slike (naslovna + u sadržaju) s Cloudinary servera.
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
