'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteMaterial } from '@/actions/material/crud'

interface Props {
  id: string
  title: string
}

export function DeleteMaterialButton({ id, title }: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    const ok = window.confirm(`Obrisati materijal "${title}"? Ova radnja je nepovratna.`)
    if (!ok) return
    startTransition(async () => {
      const res = await deleteMaterial(id)
      if (res.success) {
        toast.success('Obrisano.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-red-700 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
      aria-label="Obriši materijal"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  )
}
