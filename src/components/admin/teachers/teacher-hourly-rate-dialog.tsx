'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateTeacherHourlyRate } from '@/actions/admin/teacher-work'
import { toast } from 'sonner'

interface Props {
  teacherId: string
  /** Current rate in euro cents, or null when none is set. */
  rateCents: number | null
}

/** Cents → what the admin should see in the input, with a Croatian decimal comma. */
function toInputValue(rateCents: number | null): string {
  if (rateCents === null) return ''
  return (rateCents / 100).toFixed(2).replace('.', ',')
}

/**
 * Sets what a staff member is paid per hour. The typed string is sent as-is —
 * `updateTeacherHourlyRateSchema` owns the parse, so "12,50" and "12.50" behave
 * the same and a blank field clears the rate rather than zeroing it.
 */
export function TeacherHourlyRateDialog({ teacherId, rateCents }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(toInputValue(rateCents))
  const [isPending, startTransition] = useTransition()

  const handleOpenChange = (next: boolean) => {
    // Reopening after a cancel must show what is stored, not the abandoned edit.
    if (next) setValue(toInputValue(rateCents))
    setOpen(next)
  }

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await updateTeacherHourlyRate({ id: teacherId, hourlyRateCents: value })
      if (res.success) {
        toast.success(value.trim() === '' ? 'Satnica obrisana.' : 'Satnica spremljena.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          <Pencil className="w-3 h-3" />
          {rateCents === null ? 'Postavi satnicu' : 'Uredi satnicu'}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Satnica nastavnika</DialogTitle>
          <DialogDescription>
            Iznosi u evidenciji rada računaju se po ovoj satnici — i za ranije
            mjesece. Ostavite prazno da obrišete satnicu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="teacher-hourly-rate"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Satnica (€ po satu)
            </label>
            <input
              id="teacher-hourly-rate"
              type="text"
              inputMode="decimal"
              value={value}
              placeholder="npr. 12,50"
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Spremam...' : 'Spremi'}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
