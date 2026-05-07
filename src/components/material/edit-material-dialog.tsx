'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateMaterial } from '@/actions/material/crud'

interface Props {
  id: string
  title: string
  description: string | null
  sortOrder: number
}

export function EditMaterialDialog({ id, title: initialTitle, description: initialDescription, sortOrder: initialSortOrder }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [sortOrder, setSortOrder] = useState(initialSortOrder)
  const [isPending, startTransition] = useTransition()

  const canSubmit = title.trim().length >= 2

  const handleSubmit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await updateMaterial({
        id,
        title: title.trim(),
        description: description.trim() || null,
        sortOrder,
      })
      if (res.success) {
        toast.success('Spremljeno.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-cyan-700 rounded hover:bg-gray-50 transition-colors"
          aria-label="Uredi materijal"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi materijal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-material-title" className="block text-sm font-medium text-gray-700 mb-1.5">Naslov</label>
            <input
              id="edit-material-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label htmlFor="edit-material-description" className="block text-sm font-medium text-gray-700 mb-1.5">Opis</label>
            <textarea
              id="edit-material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label htmlFor="edit-material-sort-order" className="block text-sm font-medium text-gray-700 mb-1.5">Redoslijed</label>
            <input
              id="edit-material-sort-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number.parseInt(e.target.value, 10) || 0)}
              className="w-32 px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Spremi
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
