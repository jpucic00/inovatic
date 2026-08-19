'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Check, X, Sparkles } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { adminInputClass } from '@/lib/admin-styles'
import { formatDate } from '@/lib/format'
import { clearTrialWeek, upsertTrialWeek } from '@/actions/admin/trial-week'

interface Props {
  schoolYear: string
  startDate: Date | null
  endDate: Date | null
  editable: boolean
}

function toIsoString(d: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * The week of free trial lessons that opens the school year.
 *
 * One week for the whole city: every standard SLR group runs its probni sat
 * inside it, on that group's own weekday and time, so nothing is set per group.
 * An unset week means no probni sat is offered at all — which is why clearing it
 * deletes the row rather than blanking the dates.
 */
export function TrialWeekEditor({ schoolYear, startDate, endDate, editable }: Readonly<Props>) {
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(toIsoString(startDate))
  const [end, setEnd] = useState(toIsoString(endDate))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isSet = startDate !== null && endDate !== null

  const handleSave = () => {
    if (!start || !end) {
      toast.error('Unesite oba datuma — probni tjedan traje od–do.')
      return
    }
    startTransition(async () => {
      const result = await upsertTrialWeek({ schoolYear, startDate: start, endDate: end })
      if (result.success) {
        toast.success('Probni tjedan spremljen.')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleClear = () => {
    startTransition(async () => {
      const result = await clearTrialWeek({ schoolYear })
      if (result.success) {
        toast.success('Probni tjedan uklonjen — probni sat se više ne nudi.')
        setStart('')
        setEnd('')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleCancel = () => {
    setStart(toIsoString(startDate))
    setEnd(toIsoString(endDate))
    setEditing(false)
  }

  /**
   * Seed the inputs from the CURRENT props, not from whatever they held at
   * mount. Split has more than one admin: if a colleague saves a new week, this
   * page picks the new dates up on the next refresh and the read-only line shows
   * them — but without this the form would open on the stale ones and "Spremi"
   * would quietly write the colleague's change back out. Same across two tabs.
   */
  const handleEdit = () => {
    setStart(toIsoString(startDate))
    setEnd(toIsoString(endDate))
    setEditing(true)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="w-5 h-5 text-cyan-500 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Probni tjedan</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Tjedan besplatnih probnih sati prije početka programa. Svaka SLR grupa ima probni
              sat u svom danu i terminu unutar ovog tjedna.
            </p>
          </div>
        </div>
        {editable && !editing && (
          <button
            onClick={handleEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors shrink-0"
            title="Uredi probni tjedan"
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
              <label htmlFor="trial-start" className="text-xs text-gray-500 mb-1 block">
                Početak (ponedjeljak)
              </label>
              <DateInput
                id="trial-start"
                value={start}
                onChange={setStart}
                className={adminInputClass}
              />
            </div>
            <div>
              <label htmlFor="trial-end" className="text-xs text-gray-500 mb-1 block">
                Kraj (subota)
              </label>
              <DateInput
                id="trial-end"
                value={end}
                onChange={setEnd}
                className={adminInputClass}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Probni sat je dodatni termin prije prvog modula — ne troši nijedan od 7 termina
            modula i za dijete je besplatan. Nastavniku se broji kao redovan sat.
          </p>
          <div className="flex items-center justify-between gap-2">
            {isSet ? (
              <button
                onClick={handleClear}
                disabled={isPending}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                Ukloni probni tjedan
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
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
        </div>
      ) : (
        <div className="mt-3 text-sm">
          {isSet ? (
            <span className="text-gray-700 font-medium">
              {formatDate(startDate)} – {formatDate(endDate)}
            </span>
          ) : (
            <span className="text-gray-500">
              Nije postavljeno — probni sat se ne nudi na prijavnici.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
