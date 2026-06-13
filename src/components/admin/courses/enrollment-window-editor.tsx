'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Check, X, CalendarClock } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { adminInputClass } from '@/lib/admin-styles'
import { upsertEnrollmentWindow } from '@/actions/admin/enrollment-window'
import {
  getEnrollmentWindowState,
  ENROLLMENT_WINDOW_LABEL,
  ENROLLMENT_WINDOW_COLOR,
} from '@/lib/enrollment-window'

interface Props {
  courseId: string
  schoolYear: string
  enrollmentStart: Date | null
  enrollmentEnd: Date | null
  editable: boolean
}

function toIsoString(d: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDate(d: Date | null): string {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('hr-HR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function EnrollmentWindowEditor({
  courseId,
  schoolYear,
  enrollmentStart,
  enrollmentEnd,
  editable,
}: Readonly<Props>) {
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(toIsoString(enrollmentStart))
  const [end, setEnd] = useState(toIsoString(enrollmentEnd))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const state = getEnrollmentWindowState(enrollmentStart, enrollmentEnd)

  const handleSave = () => {
    startTransition(async () => {
      const result = await upsertEnrollmentWindow({
        courseId,
        schoolYear,
        enrollmentStart: start,
        enrollmentEnd: end,
      })
      if (result.success) {
        toast.success('Prozor upisa spremljen.')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleCancel = () => {
    setStart(toIsoString(enrollmentStart))
    setEnd(toIsoString(enrollmentEnd))
    setEditing(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarClock className="w-5 h-5 text-cyan-600 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Prozor upisa</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Vrijedi za sve grupe ovog programa u školskoj godini {schoolYear}.
            </p>
          </div>
        </div>
        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors shrink-0"
            title="Uredi prozor upisa"
          >
            <Pencil className="w-3.5 h-3.5" />
            Uredi
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="window-start" className="text-xs text-gray-500 mb-1 block">Od</label>
              <DateInput id="window-start" value={start} onChange={setStart} className={adminInputClass} />
            </div>
            <div>
              <label htmlFor="window-end" className="text-xs text-gray-500 mb-1 block">Do</label>
              <DateInput id="window-end" value={end} onChange={setEnd} className={adminInputClass} />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Ostavite oba polja prazna da zatvorite upise za ovu školsku godinu.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Odustani
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {isPending ? 'Spremam...' : 'Spremi'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-sm">
          <span className={`font-medium ${ENROLLMENT_WINDOW_COLOR[state]}`}>
            {ENROLLMENT_WINDOW_LABEL[state]}
          </span>
          {state !== 'unset' && (
            <span className="text-gray-500">
              ({formatDate(enrollmentStart)} – {formatDate(enrollmentEnd)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
