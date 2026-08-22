'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Check, X, CalendarRange } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { adminInputClass } from '@/lib/admin-styles'
import { formatDate, toDateInputValue } from '@/lib/format'
import { upsertCourseSeason } from '@/actions/admin/course-season'

interface Props {
  courseId: string
  schoolYear: string
  startDate: Date | null
  endDate: Date | null
  editable: boolean
}

/**
 * How long the competitive program runs this year, in this city. Replaces the
 * "Moduli i datumi" table for COMPETITION: its natjecanja are undated, so the
 * program is paced by this one range — each group meets weekly on its own
 * weekday inside it, and every month it touches becomes a payable item.
 */
export function CourseSeasonEditor({
  courseId,
  schoolYear,
  startDate,
  endDate,
  editable,
}: Readonly<Props>) {
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(toDateInputValue(startDate))
  const [end, setEnd] = useState(toDateInputValue(endDate))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSave = () => {
    startTransition(async () => {
      const result = await upsertCourseSeason({
        courseId,
        schoolYear,
        startDate: start,
        endDate: end,
      })
      if (result.success) {
        toast.success('Trajanje programa spremljeno.')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleCancel = () => {
    setStart(toDateInputValue(startDate))
    setEnd(toDateInputValue(endDate))
    setEditing(false)
  }

  const isSet = startDate !== null && endDate !== null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarRange className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Trajanje programa</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Termini se generiraju tjedno po danu grupe unutar ovog razdoblja, uz preskakanje
              praznika. Svaki mjesec razdoblja naplaćuje se kao članarina.
            </p>
          </div>
        </div>
        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors shrink-0"
            title="Uredi trajanje programa"
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
              <label htmlFor="season-start" className="text-xs text-gray-500 mb-1 block">
                Početak
              </label>
              <DateInput
                id="season-start"
                value={start}
                onChange={setStart}
                className={adminInputClass}
              />
            </div>
            <div>
              <label htmlFor="season-end" className="text-xs text-gray-500 mb-1 block">
                Kraj
              </label>
              <DateInput
                id="season-end"
                value={end}
                onChange={setEnd}
                className={adminInputClass}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Promjena datuma dodaje ili uklanja mjesece članarine polaznicima — već plaćeni
            mjeseci se nikad ne brišu.
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
        <div className="mt-3 text-sm">
          {isSet ? (
            <span className="text-gray-700 font-medium">
              {formatDate(startDate)} – {formatDate(endDate)}
            </span>
          ) : (
            <span className="text-amber-600 font-medium">
              Nije postavljeno — grupe nemaju termine ni članarinu.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
