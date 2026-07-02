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
import { CalendarPlus } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { TimeInput } from '@/components/ui/time-input'
import { schedulePartyInquiry } from '@/actions/admin/inquiry'
import { toast } from 'sonner'

interface SchedulePartyDialogProps {
  inquiryId: string
  /** Prefill: parent's proposed date (or the already-confirmed date on reschedule). */
  initialDate?: string
  /** Prefill: already-confirmed "HH:mm" start time. */
  initialTime?: string
  /** True when a date is already set — flips the labels to "change". */
  isRescheduling?: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function SchedulePartyDialog({
  inquiryId,
  initialDate = '',
  initialTime = '',
  isRescheduling = false,
}: Readonly<SchedulePartyDialogProps>) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const hasDate = DATE_RE.test(date)
  const hasTime = TIME_RE.test(time)
  const canSubmit = hasDate && hasTime && !isPending

  // Tell the admin exactly what still blocks the save — the date is often
  // prefilled from the parent's proposed date, so a blank time is easy to miss.
  const missingLabel = [!hasDate && 'datum', !hasTime && 'vrijeme']
    .filter(Boolean)
    .join(' i ')

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    setOpen(next)
    if (!next) {
      setDate(initialDate)
      setTime(initialTime)
    }
  }

  const handleSchedule = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await schedulePartyInquiry({ id: inquiryId, confirmedDate: date, startTime: time })
      if (result.success) {
        toast.success('Termin proslave je spremljen.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri spremanju termina.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <CalendarPlus className="w-4 h-4" />
          {isRescheduling ? 'Promijeni termin' : 'Dogovori termin'}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dogovori termin proslave</DialogTitle>
          <DialogDescription>
            Unesite dogovoreni datum i vrijeme proslave. Termin će se prikazati u kalendaru
            školske godine.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="party-date" className="block text-sm font-medium text-gray-700">
              Datum <span className="text-red-600">*</span>
            </label>
            <DateInput
              id="party-date"
              value={date}
              onChange={setDate}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="party-time" className="block text-sm font-medium text-gray-700">
              Vrijeme <span className="text-red-600">*</span>
            </label>
            <TimeInput
              id="party-time"
              value={time}
              onChange={setTime}
              disabled={isPending}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50"
            />
          </div>
        </div>
        {missingLabel && (
          <p className="text-xs text-gray-500">
            Unesite {missingLabel} proslave za spremanje termina.
          </p>
        )}
        <DialogFooter>
          <button
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={handleSchedule}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Spremam...' : 'Spremi termin'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
