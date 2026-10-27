'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { setEnrollmentAdminNote } from '@/actions/admin/payment'
import { ENROLLMENT_NOTE_MAX_LENGTH } from '@/lib/validators/admin/payment'

interface Props {
  enrollmentId: string
  note: string | null
}

/**
 * The admin's own note on one enrollment — one field, edited in place. Admin-only:
 * the card renders it behind `isAdmin`, and the teacher payload never carries it.
 */
export function EnrollmentAdminNote({ enrollmentId, note }: Readonly<Props>) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const [isPending, startTransition] = useTransition()

  const startEditing = () => {
    setDraft(note ?? '')
    setEditing(true)
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await setEnrollmentAdminNote(enrollmentId, draft)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Bilješka spremljena.')
      setEditing(false)
      router.refresh()
    })
  }

  const savedNote = note ? (
    <p className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{note}</p>
  ) : (
    <p className="text-xs text-gray-400">Nema bilješke.</p>
  )

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">Bilješka o upisu</p>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-cyan-700"
          >
            <Pencil className="w-3 h-3" />
            {note ? 'Uredi bilješku' : 'Dodaj bilješku'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            aria-label="Bilješka o upisu"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={ENROLLMENT_NOTE_MAX_LENGTH}
            rows={3}
            disabled={isPending}
            autoFocus
            placeholder="npr. plaća u dvije rate, donijeti potpisani ugovor"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Spremam...' : 'Spremi'}
            </button>
          </div>
        </div>
      ) : (
        savedNote
      )}
    </div>
  )
}
