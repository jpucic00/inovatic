'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setMaterialHidden } from '@/actions/material/crud'

interface Props {
  materialId: string
  scheduledGroupId: string
  hidden: boolean
}

/**
 * Toggles a MaterialGroupHide row. Lets a teacher hide an inherited MODULE
 * or COURSE material from *their* group only — without touching sibling
 * groups that still need it. No-op for GROUP-scoped materials (the action
 * rejects them anyway).
 */
export function HideInGroupToggle({ materialId, scheduledGroupId, hidden }: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      const res = await setMaterialHidden(materialId, scheduledGroupId, !hidden)
      if (res.success) {
        toast.success(hidden ? 'Prikazano u grupi.' : 'Sakriveno u grupi.')
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
      className={[
        'inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50',
        hidden
          ? 'text-gray-600 hover:text-cyan-700 hover:bg-cyan-50'
          : 'text-gray-600 hover:text-amber-700 hover:bg-amber-50',
      ].join(' ')}
      aria-label={hidden ? 'Prikaži u ovoj grupi' : 'Sakrij u ovoj grupi'}
      title={hidden ? 'Prikaži u ovoj grupi' : 'Sakrij u ovoj grupi'}
    >
      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {!isPending && hidden && <Eye className="w-3.5 h-3.5" />}
      {!isPending && !hidden && <EyeOff className="w-3.5 h-3.5" />}
    </button>
  )
}
